import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  MastraVoice,
  type VoiceEventMap,
  type VoiceEventType,
} from '@mastra/core/voice';
import { z } from 'zod';
import type { TurnEvent } from '../types';

interface DeepgramEvents extends VoiceEventMap {
  turn: TurnEvent;
}

type Listener<E extends VoiceEventType> = (
  data: E extends keyof DeepgramEvents ? DeepgramEvents[E] : unknown
) => void;

const fluxSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('TurnInfo'),
    event: z.enum([
      'StartOfTurn',
      'Update',
      'EagerEndOfTurn',
      'TurnResumed',
      'EndOfTurn',
    ]),
    transcript: z.string(),
  }),
  z.looseObject({
    type: z.literal('Error'),
    code: z.string().optional(),
    description: z.string().optional(),
  }),
  z.looseObject({ type: z.literal('Connected') }),
]);

const prerecordedSchema = z.looseObject({
  results: z.looseObject({
    channels: z.array(
      z.looseObject({
        alternatives: z.array(z.looseObject({ transcript: z.string() })),
      })
    ),
  }),
});

// Flux wants 80 ms chunks of 16 kHz mono linear16.
const chunkSamples = 1280;

// Deepgram behind Mastra's voice interface, built for a live call rather
// than files: `speak` streams Aura-2 PCM over REST per sentence, and the
// realtime trio (`connect`, `send`, `on`) runs Flux, whose model decides
// turn ends itself (StartOfTurn for barge-in, EagerEndOfTurn to start the
// reply early, TurnResumed to take that back, EndOfTurn to commit).
// `@mastra/voice-deepgram` only does batch `listen` and has no live socket.
export class DeepgramVoice extends MastraVoice<
  unknown,
  { signal?: AbortSignal },
  unknown,
  never,
  DeepgramEvents
> {
  private readonly events = new EventEmitter();
  private socket?: WebSocket;
  private pending = new Int16Array(0);
  private lastAudioAt = 0;
  private keepAlive?: ReturnType<typeof setInterval>;
  private closing = false;

  constructor(
    private readonly options: {
      apiKey: string;
      voice: string;
      sttModel: string;
    }
  ) {
    super({
      name: 'deepgram',
      speaker: options.voice,
      listeningModel: { name: options.sttModel },
      speechModel: { name: options.voice },
    });
  }

  async speak(
    input: string | NodeJS.ReadableStream,
    options?: { speaker?: string; signal?: AbortSignal }
  ): Promise<NodeJS.ReadableStream> {
    const text =
      typeof input === 'string'
        ? input
        : (await collect(input)).toString('utf8');
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.search = new URLSearchParams({
      model: options?.speaker ?? this.options.voice,
      encoding: 'linear16',
      sample_rate: '48000',
      container: 'none',
    }).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Token ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: options?.signal,
    });
    if (!(response.ok && response.body)) {
      throw new Error(`Deepgram speak failed: HTTP ${response.status}`);
    }
    return Readable.from(response.body);
  }

  async listen(audio: NodeJS.ReadableStream): Promise<string> {
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true',
      {
        method: 'POST',
        headers: { authorization: `Token ${this.options.apiKey}` },
        body: await collect(audio),
      }
    );
    if (!response.ok) {
      throw new Error(`Deepgram listen failed: HTTP ${response.status}`);
    }
    const parsed = prerecordedSchema.parse(await response.json());
    return parsed.results.channels[0]?.alternatives[0]?.transcript ?? '';
  }

  async getListener() {
    return { enabled: true };
  }

  connect() {
    this.closing = false;
    const url = new URL('wss://api.deepgram.com/v2/listen');
    url.search = new URLSearchParams({
      model: this.options.sttModel,
      encoding: 'linear16',
      sample_rate: '16000',
      eot_threshold: '0.7',
      eager_eot_threshold: '0.5',
      eot_timeout_ms: '5000',
    }).toString();
    const socket = new WebSocket(url, ['token', this.options.apiKey]);
    this.socket = socket;
    socket.addEventListener('message', (event) => this.receive(event.data));
    socket.addEventListener('close', () => {
      if (this.closing || this.socket !== socket) {
        return;
      }
      this.events.emit('error', { message: 'Flux socket closed, reopening' });
      setTimeout(() => {
        if (!this.closing && this.socket === socket) {
          this.connect().catch((error: unknown) =>
            this.events.emit('error', { message: String(error) })
          );
        }
      }, 1000);
    });
    // Flux expects audio in real time and gives up on a silent socket, and
    // Chime stops sending when the room goes quiet, so pad with silence.
    clearInterval(this.keepAlive);
    this.keepAlive = setInterval(() => {
      if (Date.now() - this.lastAudioAt > 160) {
        this.write(new Int16Array(chunkSamples));
      }
    }, 80);
    return new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener(
        'error',
        () => reject(new Error('Deepgram Flux connection failed')),
        { once: true }
      );
    });
  }

  async send(audio: NodeJS.ReadableStream | Int16Array) {
    if (!(audio instanceof Int16Array)) {
      for await (const chunk of audio) {
        if (Buffer.isBuffer(chunk)) {
          await this.send(
            new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length >> 1)
          );
        }
      }
      return;
    }
    this.lastAudioAt = Date.now();
    const merged = new Int16Array(this.pending.length + audio.length);
    merged.set(this.pending);
    merged.set(audio, this.pending.length);
    let offset = 0;
    for (; offset + chunkSamples <= merged.length; offset += chunkSamples) {
      this.write(merged.subarray(offset, offset + chunkSamples));
    }
    this.pending = merged.slice(offset);
  }

  on<E extends VoiceEventType>(event: E, callback: Listener<E>) {
    this.events.on(event, callback);
  }

  off<E extends VoiceEventType>(event: E, callback: Listener<E>) {
    this.events.off(event, callback);
  }

  close() {
    this.closing = true;
    clearInterval(this.keepAlive);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'CloseStream' }));
    }
    this.socket?.close();
    this.events.removeAllListeners();
  }

  private write(pcm: Int16Array<ArrayBuffer>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(pcm);
    }
  }

  private receive(data: unknown) {
    if (typeof data !== 'string') {
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = fluxSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }
    const message = parsed.data;
    if (message.type === 'Error') {
      this.events.emit('error', {
        message: message.description ?? 'Deepgram Flux error',
        code: message.code,
      });
      return;
    }
    if (message.type !== 'TurnInfo') {
      return;
    }
    const turn = toTurnEvent(message);
    if (!turn) {
      return;
    }
    this.events.emit('turn', turn);
    if (turn.type === 'end') {
      this.events.emit('writing', { text: turn.transcript, role: 'user' });
    }
  }
}

function toTurnEvent(message: {
  event: string;
  transcript: string;
}): TurnEvent | undefined {
  const transcript = message.transcript.trim();
  if (message.event === 'StartOfTurn') {
    return { type: 'start' };
  }
  if (message.event === 'TurnResumed') {
    return { type: 'resumed' };
  }
  if (!transcript) {
    return;
  }
  if (message.event === 'EagerEndOfTurn') {
    return { type: 'eager', transcript };
  }
  if (message.event === 'EndOfTurn') {
    return { type: 'end', transcript };
  }
}

async function collect(input: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
