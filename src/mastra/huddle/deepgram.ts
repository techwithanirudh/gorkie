import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { DeepgramClient } from '@deepgram/sdk';
import {
  MastraVoice,
  type VoiceEventMap,
  type VoiceEventType,
} from '@mastra/core/voice';
import { z } from 'zod';
import { huddle as config } from '../config';
import type { TurnEvent } from '../types';

interface DeepgramEvents extends VoiceEventMap {
  audio: { pcm: Int16Array<ArrayBuffer>; at: number };
  interrupted: { textSpoken: string };
  turn: TurnEvent;
}

type Listener<E extends VoiceEventType> = (
  data: E extends keyof DeepgramEvents ? DeepgramEvents[E] : unknown
) => void;

type ListenSocket = Awaited<
  ReturnType<DeepgramClient['listen']['v2']['connect']>
>;
type SpeakSocket = Awaited<
  ReturnType<DeepgramClient['speak']['v2']['connect']>
>;

const turnSchema = z.looseObject({
  type: z.literal('TurnInfo'),
  event: z.string(),
  transcript: z.string(),
});

const speakSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('SpeechInterrupted'),
    text_spoken: z.string().optional(),
  }),
  z.looseObject({ type: z.literal('SpeechStarted') }),
  z.looseObject({
    type: z.enum(['Error', 'Warning']),
    description: z.string().optional(),
  }),
]);

const errorSchema = z.looseObject({
  type: z.enum(['Error', 'FatalError']),
  description: z.string().optional(),
});

const prerecordedSchema = z.looseObject({
  results: z.looseObject({
    channels: z.array(
      z.looseObject({
        alternatives: z.array(z.looseObject({ transcript: z.string() })),
      })
    ),
  }),
});

// Flux STT wants 80 ms chunks of 16 kHz mono linear16.
const chunkSamples = 1280;

// Deepgram's Flux models behind Mastra's voice interface, built for a live
// call. The realtime trio (`connect`, `send`, `on`) holds two warm sockets
// through `@deepgram/sdk`, which reconnects them itself: Flux STT, whose
// model decides turns (StartOfTurn for barge-in, EndOfTurn to reply), and
// Flux TTS, which takes the agent's raw text deltas and picks its own
// sentence boundaries. `interrupt` tells TTS how much audio actually played,
// so the `interrupted` event carries the text the room heard. Flux's eager
// end of turn is left off: a discarded speculative run would still leave
// its half turn in the memory thread. `@mastra/voice-deepgram` only does
// batch `listen` and REST `speak`.
export class DeepgramVoice extends MastraVoice<
  unknown,
  { abortSignal?: AbortSignal },
  unknown,
  never,
  DeepgramEvents
> {
  private readonly client: DeepgramClient;
  private readonly options: { voice: string; sttModel: string };
  private readonly events = new EventEmitter();
  private readonly lifetime = new AbortController();
  private listenSocket?: ListenSocket;
  private speakSocket?: SpeakSocket;
  private pending = new Int16Array(0);
  private lastAudioAt = 0;
  private keepAlive?: ReturnType<typeof setInterval>;
  // Audio still in flight from a turn being interrupted is dropped until
  // TTS confirms the cut.
  private speech: 'live' | 'interrupting' = 'live';
  private interruptTimer?: ReturnType<typeof setTimeout>;
  private audioQueue: Promise<void> = Promise.resolve();
  // Samples TTS has sent since its socket opened, dropped audio included,
  // because Interrupt's playback offset is measured on that timeline.
  private timeline = 0;

  constructor({
    apiKey,
    voice,
    sttModel,
  }: {
    apiKey: string;
    voice: string;
    sttModel: string;
  }) {
    super({
      name: 'deepgram',
      speaker: voice,
      listeningModel: { name: sttModel },
      speechModel: { name: voice },
    });
    this.client = new DeepgramClient({ apiKey });
    this.options = { voice, sttModel };
  }

  async speak(
    input: string | NodeJS.ReadableStream,
    options?: { speaker?: string; abortSignal?: AbortSignal }
  ): Promise<NodeJS.ReadableStream> {
    const text =
      typeof input === 'string' ? input : (await collect(input)).toString();
    const response = await this.client.speak.v2.audio.generate(
      {
        model: options?.speaker ?? this.options.voice,
        text,
        encoding: 'linear16',
        sample_rate: 48_000,
        container: 'none',
      },
      { abortSignal: options?.abortSignal }
    );
    const body = response.stream();
    if (!body) {
      throw new Error('Deepgram speak returned no audio');
    }
    return Readable.from(body);
  }

  async listen(audio: NodeJS.ReadableStream): Promise<string> {
    const response = await this.client.listen.v1.media.transcribeFile(
      await collect(audio),
      { model: config.batchSttModel, smart_format: true }
    );
    const parsed = prerecordedSchema.safeParse(response);
    return parsed.data?.results.channels[0]?.alternatives[0]?.transcript ?? '';
  }

  getListener() {
    return Promise.resolve({ enabled: true });
  }

  async connect() {
    const shared = {
      abortSignal: this.lifetime.signal,
      connectionTimeoutInSeconds: 15,
    };
    const [listen, speak] = await Promise.all([
      this.client.listen.v2.connect({
        ...shared,
        model: this.options.sttModel,
        encoding: 'linear16',
        sample_rate: 16_000,
        eot_threshold: config.eotThreshold,
        eot_timeout_ms: config.eotTimeoutMs,
      }),
      this.client.speak.v2.connect({
        ...shared,
        model: this.options.voice,
        encoding: 'linear16',
        sample_rate: '48000',
      }),
    ]);
    listen.on('message', (message: unknown) => this.onListen(message));
    speak.on('message', (message: unknown) => this.onSpeak(message));
    speak.on('open', () => {
      this.timeline = 0;
    });
    for (const socket of [listen, speak]) {
      socket.on('error', (error) =>
        this.events.emit('error', { message: error.message })
      );
      socket.connect();
    }
    await Promise.all([listen.waitForOpen(), speak.waitForOpen()]);
    this.listenSocket = listen;
    this.speakSocket = speak;
    // Flux expects audio in real time and gives up on a silent socket, and
    // Chime stops sending when the room goes quiet, so pad with silence.
    clearInterval(this.keepAlive);
    this.keepAlive = setInterval(() => {
      if (Date.now() - this.lastAudioAt > 160) {
        whenOpen(() =>
          this.listenSocket?.sendMedia(new Int16Array(chunkSamples))
        );
      }
    }, 80);
  }

  async send(audio: NodeJS.ReadableStream | Int16Array) {
    if (!(audio instanceof Int16Array)) {
      const bytes = await collect(audio);
      await this.send(
        new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
      );
      return;
    }
    this.lastAudioAt = Date.now();
    const merged = new Int16Array(this.pending.length + audio.length);
    merged.set(this.pending);
    merged.set(audio, this.pending.length);
    let offset = 0;
    for (; offset + chunkSamples <= merged.length; offset += chunkSamples) {
      whenOpen(() =>
        this.listenSocket?.sendMedia(
          merged.subarray(offset, offset + chunkSamples)
        )
      );
    }
    this.pending = merged.slice(offset);
  }

  say(text: string) {
    whenOpen(() => this.speakSocket?.sendSpeak({ type: 'Speak', text }));
  }

  flush() {
    whenOpen(() => this.speakSocket?.sendFlush({ type: 'Flush' }));
  }

  interrupt(playedSample: number) {
    this.speech = 'interrupting';
    whenOpen(() =>
      this.speakSocket?.sendInterrupt({
        type: 'Interrupt',
        playback_offset: {
          type: 'time_ms',
          value: Math.round(playedSample / 48),
        },
      })
    );
    // With no turn left to cut, TTS may never answer, and audio must not
    // stay muted waiting for it.
    clearTimeout(this.interruptTimer);
    this.interruptTimer = setTimeout(() => this.interrupted(''), 1500);
  }

  on<E extends VoiceEventType>(event: E, callback: Listener<E>) {
    this.events.on(event, callback);
  }

  off<E extends VoiceEventType>(event: E, callback: Listener<E>) {
    this.events.off(event, callback);
  }

  close() {
    clearInterval(this.keepAlive);
    clearTimeout(this.interruptTimer);
    whenOpen(() => this.listenSocket?.sendCloseStream({ type: 'CloseStream' }));
    whenOpen(() => this.speakSocket?.sendClose({ type: 'Close' }));
    this.lifetime.abort();
    this.events.removeAllListeners();
  }

  private interrupted(textSpoken: string) {
    if (this.speech !== 'interrupting') {
      return;
    }
    clearTimeout(this.interruptTimer);
    this.speech = 'live';
    this.events.emit('interrupted', { textSpoken });
  }

  private onListen(message: unknown) {
    const error = errorSchema.safeParse(message);
    if (error.success) {
      this.events.emit('error', {
        message: error.data.description ?? 'Deepgram Flux STT error',
      });
      return;
    }
    const turn = turnSchema.safeParse(message);
    if (!turn.success) {
      return;
    }
    const transcript = turn.data.transcript.trim();
    if (turn.data.event === 'StartOfTurn') {
      this.events.emit('turn', { type: 'start' });
      return;
    }
    if (turn.data.event !== 'EndOfTurn') {
      return;
    }
    // An empty turn (a cough, a door) still has to end, or the session
    // keeps thinking someone holds the floor.
    this.events.emit('turn', { type: 'end', transcript });
    if (transcript) {
      this.events.emit('writing', { text: transcript, role: 'user' });
    }
  }

  private onSpeak(message: unknown) {
    if (message instanceof Blob) {
      // Blob reads are async, so chain them to keep audio in order.
      this.audioQueue = this.audioQueue
        .then(async () => {
          const bytes = await message.arrayBuffer();
          const pcm = new Int16Array(
            bytes,
            0,
            Math.floor(bytes.byteLength / 2)
          );
          const at = this.timeline;
          this.timeline += pcm.length;
          if (this.speech === 'live') {
            this.events.emit('audio', { pcm, at });
          }
        })
        .catch(() => undefined);
      return;
    }
    const parsed = speakSchema.safeParse(message);
    if (!parsed.success) {
      return;
    }
    const event = parsed.data;
    if (event.type === 'SpeechInterrupted') {
      this.interrupted(event.text_spoken ?? '');
      return;
    }
    if (event.type === 'SpeechStarted') {
      this.interrupted('');
      return;
    }
    this.events.emit('error', {
      message: event.description ?? `Deepgram Flux TTS ${event.type}`,
    });
  }
}

// The SDK throws on a send while a socket is reconnecting. Losing an 80 ms
// audio chunk or a text fragment then beats breaking the caller's loop.
function whenOpen(send: () => void) {
  try {
    send();
  } catch {
    // Reconnecting; dropped.
  }
}

async function collect(input: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
