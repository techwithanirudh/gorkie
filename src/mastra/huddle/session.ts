import { RequestContext } from '@mastra/core/request-context';
import {
  Application,
  createDecoder,
  createEncoder,
  type OpusDecoderHandle,
} from 'libopus-wasm';
import { exploreAgent } from '../agents/explore';
import { researchAgent } from '../agents/research';
import { voiceAgent } from '../agents/voice';
import { chat } from '../chat/instance';
import { resolveUserProfile } from '../chat/names';
import { huddle as config } from '../config';
import { threadIdOf } from '../lib/ids';
import { logger } from '../lib/logger';
import type {
  HuddleAgentKey,
  JoinedHuddle,
  SignalFrame,
  TurnEvent,
  VoiceMessage,
} from '../types';
import { ChimeLink } from './chime/link';
import { DeepgramVoice } from './deepgram';
import { delegates } from './delegate';

// 20 ms at 48 kHz, the Opus frame Chime expects.
const frameSamples = 960;
const frameMs = 20;

interface Reply {
  committed: boolean;
  controller: AbortController;
  // A reply started on EagerEndOfTurn stays held, generating but silent,
  // until EndOfTurn confirms the user is done (LiveKit's preemptive
  // generation without preemptive TTS).
  held: boolean;
  queued: string[];
  release: () => void;
  released: Promise<void>;
  // Finished delegations folded into this turn, dropped from the queue only
  // once the turn is committed, so a cancelled speculative reply loses none.
  results: string[];
  speech: Promise<void>;
  spoken: string[];
  transcript: string;
}

// Splits off the first sentence once there is enough text to be worth a TTS
// request, so audio starts after the first sentence rather than the reply.
function nextSentence(text: string) {
  const pattern = /[.!?]\s|\n/g;
  pattern.lastIndex = 12;
  const match = pattern.exec(text);
  if (!match) {
    return;
  }
  const cut = match.index + match[0].length;
  return { sentence: text.slice(0, cut).trim(), rest: text.slice(cut) };
}

function content(reply: Reply) {
  return [...reply.results, reply.transcript].filter(Boolean).join('\n\n');
}

export class HuddleSession {
  private readonly joined: JoinedHuddle;
  private readonly onEnd: () => void;
  private readonly voice: DeepgramVoice;
  private readonly link: ChimeLink;
  private decoder?: OpusDecoderHandle;
  private readonly history: VoiceMessage[] = [];
  private results: string[] = [];
  private playback: Int16Array[] = [];
  private playbackOffset = 0;
  private reply?: Reply;
  private userSpeaking = false;
  private readonly attendees = new Map<
    number,
    { attendeeId: string; userId?: string }
  >();
  private readonly names = new Map<string, string>();
  private lastSpeaker?: string;
  private aloneSince?: number;
  private lastActivityAt = Date.now();
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private readonly controller = new AbortController();
  private ending?: Promise<void>;

  constructor({
    joined,
    apiKey,
    onEnd,
  }: {
    joined: JoinedHuddle;
    apiKey: string;
    onEnd: () => void;
  }) {
    this.joined = joined;
    this.onEnd = onEnd;
    this.voice = new DeepgramVoice({
      apiKey,
      voice: config.voice,
      sttModel: config.sttModel,
    });
    this.link = new ChimeLink(joined.chime, {
      onAudio: (opus) => {
        try {
          const pcm = this.decoder?.decode(opus);
          if (pcm) {
            this.voice.send(pcm).catch(() => undefined);
          }
        } catch {
          // A corrupt packet is one lost 20 ms frame, not worth more.
        }
      },
      onFrame: (frame) => this.track(frame),
      onSignaling: () => this.attendees.clear(),
      onTerminal: (reason) => {
        this.end(reason).catch(() => undefined);
      },
      onWarn: (event, fields) =>
        logger.warn(`[huddle] ${event}`, { callId: this.callId, ...fields }),
    });
  }

  get callId() {
    return this.joined.callId;
  }

  async start() {
    const { joined, link, voice } = this;
    const [decoder, encoder] = await Promise.all([
      createDecoder({ channels: 1, sampleRate: 16_000 }),
      createEncoder({
        channels: 1,
        sampleRate: 48_000,
        application: Application.Voip,
        bitrate: 48_000,
        fec: true,
      }),
    ]);
    this.decoder = decoder;
    voice.on('turn', (turn) => this.onTurn(turn));
    voice.on('error', (error) =>
      logger.warn('[huddle] deepgram error', { callId: this.callId, error })
    );
    await voice.connect();

    await link.start();
    delegates.set(this.callId, (job) => this.delegate(job));

    let base = performance.now();
    let sent = 0;
    this.timers.push(
      setInterval(() => {
        // After an event loop stall, carry on from now instead of bursting
        // out the backlog, which the far end would only drop.
        if (Math.floor((performance.now() - base) / frameMs) - sent > 10) {
          base = performance.now() - frameMs;
          sent = 0;
        }
        const due = Math.floor((performance.now() - base) / frameMs);
        for (; sent < due; sent++) {
          link.sendAudio(encoder.encode(this.nextFrame()));
        }
      }, 10),
      setInterval(() => this.checkPresence(), 5000)
    );
    logger.info('[huddle] joined', {
      callId: this.callId,
      channelId: joined.channelId,
    });
    this.startReply({
      transcript: '[you just joined the huddle, say hi in a few words]',
      held: false,
    });
  }

  end(reason: string) {
    this.ending ??= this.shutdown(reason);
    return this.ending;
  }

  private async shutdown(reason: string) {
    logger.info('[huddle] leaving', { callId: this.callId, reason });
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.controller.abort();
    this.reply?.controller.abort();
    delegates.delete(this.callId);
    this.voice.close();
    await this.link.leave().catch(() => undefined);
    this.onEnd();
  }

  private nextFrame() {
    const frame = new Int16Array(frameSamples);
    let written = 0;
    for (
      let [chunk] = this.playback;
      chunk && written < frameSamples;
      [chunk] = this.playback
    ) {
      const take = Math.min(
        frameSamples - written,
        chunk.length - this.playbackOffset
      );
      frame.set(
        chunk.subarray(this.playbackOffset, this.playbackOffset + take),
        written
      );
      written += take;
      this.playbackOffset += take;
      if (this.playbackOffset >= chunk.length) {
        this.playback.shift();
        this.playbackOffset = 0;
      }
    }
    return frame;
  }

  private onTurn(turn: TurnEvent) {
    this.lastActivityAt = Date.now();
    if (turn.type === 'start') {
      this.userSpeaking = true;
      // Barge-in: only audible speech gets cut. A reply still thinking is
      // left alone, since the next end of turn supersedes it anyway.
      if (this.playback.length) {
        this.cancel({ interrupted: true });
      }
      return;
    }
    if (turn.type === 'resumed') {
      this.userSpeaking = true;
      if (this.reply?.held) {
        this.reply.controller.abort();
        this.reply = undefined;
      }
      return;
    }
    this.userSpeaking = false;
    const name = this.lastSpeaker
      ? this.names.get(this.lastSpeaker)
      : undefined;
    const transcript = name ? `${name}: ${turn.transcript}` : turn.transcript;
    const { reply } = this;
    if (turn.type === 'end' && reply?.held && reply.transcript === transcript) {
      reply.release();
      return;
    }
    this.cancel({ interrupted: false });
    this.startReply({ transcript, held: turn.type === 'eager' });
  }

  // Stops the current reply. A held reply never spoke, so it leaves no
  // trace; otherwise the user turn and whatever was said are kept.
  private cancel({ interrupted }: { interrupted: boolean }) {
    const { reply } = this;
    this.playback = [];
    this.playbackOffset = 0;
    if (!reply) {
      return;
    }
    reply.controller.abort();
    this.reply = undefined;
    if (!reply.held) {
      this.commit({ reply, interrupted });
    }
  }

  private commit({
    reply,
    interrupted,
  }: {
    reply: Reply;
    interrupted: boolean;
  }) {
    if (reply.committed) {
      return;
    }
    reply.committed = true;
    const said = reply.spoken.join(' ');
    this.results = this.results.filter(
      (result) => !reply.results.includes(result)
    );
    this.history.push({ role: 'user', content: content(reply) });
    if (said || interrupted) {
      this.history.push({
        role: 'assistant',
        content: interrupted ? `${said} [interrupted]`.trim() : said,
      });
    }
    this.history.splice(
      0,
      Math.max(0, this.history.length - config.maxHistory)
    );
  }

  private startReply({
    transcript,
    held,
  }: {
    transcript: string;
    held: boolean;
  }) {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reply: Reply = {
      transcript,
      results: [...this.results],
      controller: new AbortController(),
      held,
      released,
      release: () => {
        reply.held = false;
        for (const sentence of reply.queued.splice(0)) {
          this.say({ reply, sentence });
        }
        release();
      },
      queued: [],
      spoken: [],
      speech: Promise.resolve(),
      committed: false,
    };
    if (!held) {
      release();
    }
    this.reply = reply;
    this.runReply(reply).catch((error: unknown) => {
      if (reply.controller.signal.aborted) {
        return;
      }
      logger.warn('[huddle] reply failed', { callId: this.callId, error });
      if (this.reply === reply) {
        this.reply = undefined;
      }
    });
  }

  private async runReply(reply: Reply) {
    const { signal } = reply.controller;
    const stream = await voiceAgent.stream(
      [...this.history, { role: 'user', content: content(reply) }],
      { abortSignal: signal, requestContext: this.requestContext() }
    );
    let buffer = '';
    for await (const chunk of stream.textStream) {
      if (signal.aborted) {
        return;
      }
      buffer += chunk;
      for (let next = nextSentence(buffer); next; next = nextSentence(buffer)) {
        this.say({ reply, sentence: next.sentence });
        buffer = next.rest;
      }
    }
    if (buffer.trim()) {
      this.say({ reply, sentence: buffer.trim() });
    }
    await reply.released;
    await reply.speech;
    if (signal.aborted || this.reply !== reply) {
      return;
    }
    this.commit({ reply, interrupted: false });
    this.reply = undefined;
    this.flushResults();
  }

  private say({ reply, sentence }: { reply: Reply; sentence: string }) {
    if (reply.held) {
      reply.queued.push(sentence);
      return;
    }
    const { signal } = reply.controller;
    // Requested now so it downloads while earlier sentences play.
    const audio = this.voice.speak(sentence, { signal });
    audio.catch(() => undefined);
    reply.speech = reply.speech.then(async () => {
      const stream = await audio;
      let carry = Buffer.alloc(0);
      for await (const chunk of stream) {
        if (signal.aborted) {
          return;
        }
        const bytes = Buffer.concat([carry, Buffer.from(chunk)]);
        const usable = bytes.length - (bytes.length % 2);
        const samples = new Int16Array(usable / 2);
        Buffer.from(samples.buffer).set(bytes.subarray(0, usable));
        this.playback.push(samples);
        carry = bytes.subarray(usable);
      }
      reply.spoken.push(sentence);
    });
  }

  private delegate({ agent, task }: { agent: HuddleAgentKey; task: string }) {
    const subagent = agent === 'research' ? researchAgent : exploreAgent;
    logger.info('[huddle] delegating', { callId: this.callId, agent });
    subagent
      .generate(task, {
        abortSignal: this.controller.signal,
        requestContext: this.requestContext(),
      })
      .then(async ({ text }) => {
        const posted = await this.postToThread(
          `*${agent}* on _${task}_\n\n${text}`
        );
        this.results.push(
          `[result] ${agent} finished "${task}"${posted ? ' (full result posted in the huddle thread)' : ''}:\n${text.slice(0, 6000)}`
        );
      })
      .catch((error: unknown) => {
        if (this.controller.signal.aborted) {
          return;
        }
        logger.warn('[huddle] delegation failed', {
          callId: this.callId,
          error,
        });
        this.results.push(`[result] ${agent} failed on "${task}"`);
      })
      .finally(() => this.flushResults());
  }

  private async postToThread(text: string) {
    const { channelId, threadTs } = this.joined;
    const threadId = threadIdOf({ channel: channelId, ts: threadTs });
    if (!threadId) {
      return false;
    }
    try {
      await chat().thread(threadId).post(text);
      return true;
    } catch (error) {
      logger.debug('[huddle] could not post to the huddle thread', { error });
      return false;
    }
  }

  // A finished job speaks up only into a quiet room; otherwise it rides
  // along with the next user turn.
  private flushResults() {
    if (
      this.ending ||
      !this.results.length ||
      this.reply ||
      this.userSpeaking ||
      this.playback.length
    ) {
      return;
    }
    this.startReply({ transcript: '', held: false });
  }

  private requestContext() {
    const { channelId, threadTs } = this.joined;
    const requestContext = new RequestContext();
    requestContext.set('channel', {
      channelId,
      threadId: threadIdOf({ channel: channelId, ts: threadTs }),
      userId: this.lastSpeaker,
      isDM: false,
    });
    requestContext.set('huddle', this.callId);
    return requestContext;
  }

  private track(frame: SignalFrame) {
    const self = this.link.attendeeId;
    for (const stream of frame.audio_stream_id_info?.streams ?? []) {
      if (stream.attendee_id) {
        // Slack puts the member's user id somewhere in the Chime external
        // user id; its exact framing is undocumented, so match the shape.
        const userId =
          stream.external_user_id?.match(/\b[UW][A-Z0-9]{8,}\b/)?.[0];
        this.attendees.set(stream.audio_stream_id, {
          attendeeId: stream.attendee_id,
          userId,
        });
        if (userId && !this.names.has(userId)) {
          this.names.set(userId, userId);
          resolveUserProfile(userId)
            .then((profile) => {
              const name = profile?.displayName ?? profile?.realName;
              if (name) {
                this.names.set(userId, name);
              }
            })
            .catch(() => undefined);
        }
        continue;
      }
      // An entry with neither an attendee nor a mute state means it left.
      if (stream.muted === undefined) {
        this.attendees.delete(stream.audio_stream_id);
      }
    }
    for (const state of frame.audio_metadata?.attendee_states ?? []) {
      // Volume is attenuation in dB; the JS SDK treats 42 and up as silence.
      const attendee = this.attendees.get(state.audio_stream_id);
      if (
        attendee?.userId &&
        attendee.attendeeId !== self &&
        state.volume !== undefined &&
        state.volume < 36
      ) {
        this.lastSpeaker = attendee.userId;
      }
    }
  }

  private checkPresence() {
    const self = this.link.attendeeId;
    const others = [...this.attendees.values()].some(
      ({ attendeeId }) => attendeeId !== self
    );
    const now = Date.now();
    this.aloneSince = others ? undefined : (this.aloneSince ?? now);
    if (this.aloneSince && now - this.aloneSince > config.aloneTimeout) {
      this.end('everyone left').catch(() => undefined);
      return;
    }
    if (now - this.lastActivityAt > config.idleTimeout) {
      this.end('idle').catch(() => undefined);
    }
  }
}
