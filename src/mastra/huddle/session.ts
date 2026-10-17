import type { AgentThreadSubscription } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import {
  Application,
  createDecoder,
  createEncoder,
  type OpusDecoderHandle,
} from 'libopus-wasm';
import { z } from 'zod';
import { addresseeAgent } from '../agents/addressee';
import { voiceAgent } from '../agents/voice';
import { chat } from '../chat/instance';
import { getMastra } from '../chat/mastra-instance';
import { resolveUserProfile } from '../chat/names';
import { huddle as config } from '../config';
import { threadIdOf } from '../lib/ids';
import { logger } from '../lib/logger';
import type { JoinedHuddle, SignalFrame, TurnEvent } from '../types';
import { ChimeLink } from './chime/link';
import { DeepgramVoice } from './deepgram';

// 20 ms at 48 kHz, the Opus frame Chime expects.
const frameSamples = 960;
const frameMs = 20;

const fillers = [
  'still on it.',
  'still digging, one sec.',
  'almost there, hang tight.',
];

const taskEventSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('background-task-running'),
    payload: z.looseObject({ taskId: z.string(), toolName: z.string() }),
  }),
  z.looseObject({
    type: z.literal('background-task-completed'),
    payload: z.looseObject({
      taskId: z.string(),
      toolName: z.string(),
      result: z.unknown(),
    }),
  }),
  z.looseObject({
    type: z.enum(['background-task-failed', 'background-task-cancelled']),
    payload: z.looseObject({ taskId: z.string(), toolName: z.string() }),
  }),
]);

const subagentResultSchema = z.looseObject({ text: z.string() });

// A soft rising three note "tu du dum" every 1.4 s, synthesized at 48 kHz so
// there is no audio asset to ship. Each note is a sine under a half sine
// envelope, so it starts and stops without clicks.
const thinkingLoop = new Int16Array(67_200);
for (const [start, hz] of [
  [0, 523],
  [0.14, 659],
  [0.28, 784],
] as const) {
  const offset = Math.round(start * 48_000);
  const length = 5280;
  for (let i = 0; i < length; i++) {
    thinkingLoop[offset + i] = Math.round(
      Math.sin((Math.PI * i) / length) *
        Math.sin((2 * Math.PI * hz * i) / 48_000) *
        config.thinking.volume *
        32_767
    );
  }
}

// One huddle, run as a Mastra memory thread. Utterances go in through
// `sendMessage`, the talker's output comes back on one thread subscription
// and streams into Flux TTS as it is written, and delegations run as background
// tasks. An idle wake runs with `untilIdle`, so Mastra itself continues the
// talker when a task finishes; the session only covers the cases where that
// wrapper was closed first (barge-in, a newer wake, its idle timeout).
export class HuddleSession {
  private readonly joined: JoinedHuddle;
  private readonly inviterId: string;
  private readonly onEnd: () => void;
  private readonly voice: DeepgramVoice;
  private readonly link: ChimeLink;
  private readonly thread: { resourceId: string; threadId: string };
  private decoder?: OpusDecoderHandle;
  private subscription?: AgentThreadSubscription;
  // TTS audio waiting to play, each chunk tagged with where it starts on
  // the TTS timeline, which is what a barge-in reports back.
  private playback: { pcm: Int16Array; at: number }[] = [];
  private playbackOffset = 0;
  private played = 0;
  private ttsTurn: 'idle' | 'open' = 'idle';
  // Set from the moment gorkie owes a reply until its first audio arrives.
  private thinking?: { since: number; at: number };
  // The last few lines of the room, gorkie's included, for the addressee
  // check. The reply being written is held apart until its run ends.
  private recent: string[] = [];
  private reply = '';
  private turns: Promise<void> = Promise.resolve();
  // Utterances sent to a run whose first step has not finished, which is
  // when `savePerStep` writes them. A barge-in before then loses them.
  private unsaved: string[] = [];
  // Unsaved utterances from an interrupted run, held until TTS reports what
  // was actually heard.
  private cutOff: string[] = [];
  private abortedRunId?: string;
  private lastRunStartAt = 0;
  private lastInputAt = 0;
  private lastSpokeAt = 0;
  private floor: 'open' | 'user' = 'open';
  private readonly running = new Map<string, string>();
  private results: { agent: string; text: string; at: number }[] = [];
  private filler: { count: number; lastAt: number } = { count: 0, lastAt: 0 };
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
    inviterId,
    apiKey,
    onEnd,
  }: {
    joined: JoinedHuddle;
    inviterId: string;
    apiKey: string;
    onEnd: () => void;
  }) {
    this.joined = joined;
    this.inviterId = inviterId;
    this.onEnd = onEnd;
    this.thread = {
      resourceId: `huddle:${joined.channelId}`,
      threadId: `huddle:${joined.callId}`,
    };
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

  get channelId() {
    return this.joined.channelId;
  }

  async start() {
    const { link, voice } = this;
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
    voice.on('audio', (audio) => {
      this.thinking = undefined;
      this.playback.push(audio);
      this.lastSpokeAt = Date.now();
    });
    voice.on('interrupted', ({ textSpoken }) =>
      this.noteInterruption(textSpoken)
    );
    voice.on('error', (error) =>
      logger.warn('[huddle] deepgram error', { callId: this.callId, error })
    );
    await voice.connect();
    await link.start();

    const subscription = await voiceAgent.subscribeToThread(this.thread);
    this.subscription = subscription;
    this.consume(subscription).catch((error: unknown) =>
      logger.warn('[huddle] thread subscription ended', { error })
    );
    this.watchTasks().catch((error: unknown) =>
      logger.warn('[huddle] task stream ended', { error })
    );

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
      setInterval(() => this.tick(), 1000)
    );
    logger.info('[huddle] joined', {
      callId: this.callId,
      channelId: this.joined.channelId,
    });
    this.signal({
      tagName: 'joined',
      contents: 'You just joined the huddle. Greet the room in a few words.',
      wake: true,
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
    this.subscription?.abort();
    this.subscription?.unsubscribe();
    this.voice.close();
    await this.link.leave().catch(() => undefined);
    this.onEnd();
  }

  private async consume(subscription: AgentThreadSubscription) {
    for await (const chunk of subscription.stream) {
      if (chunk.runId === this.abortedRunId) {
        continue;
      }
      if (chunk.type === 'start') {
        this.lastRunStartAt = Date.now();
        continue;
      }
      if (chunk.type === 'text-delta') {
        if (chunk.payload.text) {
          this.reply += chunk.payload.text;
          this.voice.say(chunk.payload.text);
          this.ttsTurn = 'open';
        }
        continue;
      }
      if (chunk.type === 'step-finish') {
        this.unsaved = [];
        continue;
      }
      if (chunk.type !== 'finish' && chunk.type !== 'error') {
        continue;
      }
      if (this.reply.trim()) {
        this.remember(`gorkie: ${this.reply.trim()}`);
        this.reply = '';
      }
      if (this.ttsTurn === 'open') {
        this.voice.flush();
        this.ttsTurn = 'idle';
        continue;
      }
      // A run that ended without a word (a quiet delegation, an error) owes
      // no audio, so the thinking sound would loop to its timeout.
      this.thinking = undefined;
    }
  }

  private async watchTasks() {
    const manager = getMastra().backgroundTaskManager;
    if (!manager) {
      return;
    }
    const stream = manager.stream({
      threadId: this.thread.threadId,
      abortSignal: this.controller.signal,
    });
    for await (const raw of stream) {
      const parsed = taskEventSchema.safeParse(raw);
      if (!parsed.success) {
        continue;
      }
      const { type, payload } = parsed.data;
      if (type === 'background-task-running') {
        this.running.set(payload.taskId, payload.toolName);
        this.filler = { count: 0, lastAt: Date.now() };
        continue;
      }
      this.running.delete(payload.taskId);
      if (parsed.data.type !== 'background-task-completed') {
        continue;
      }
      const text =
        subagentResultSchema.safeParse(parsed.data.payload.result).data?.text ??
        '';
      this.results.push({ agent: payload.toolName, text, at: Date.now() });
      this.postToThread(`*${payload.toolName}* finished\n\n${text}`);
    }
  }

  private nextFrame() {
    const frame = new Int16Array(frameSamples);
    if (this.thinking && !this.playback.length) {
      for (let i = 0; i < frameSamples; i++) {
        frame[i] = thinkingLoop[this.thinking.at] ?? 0;
        this.thinking.at = (this.thinking.at + 1) % thinkingLoop.length;
      }
      return frame;
    }
    let written = 0;
    for (
      let [chunk] = this.playback;
      chunk && written < frameSamples;
      [chunk] = this.playback
    ) {
      const take = Math.min(
        frameSamples - written,
        chunk.pcm.length - this.playbackOffset
      );
      frame.set(
        chunk.pcm.subarray(this.playbackOffset, this.playbackOffset + take),
        written
      );
      written += take;
      this.playbackOffset += take;
      this.played = chunk.at + this.playbackOffset;
      if (this.playbackOffset >= chunk.pcm.length) {
        this.playback.shift();
        this.playbackOffset = 0;
      }
    }
    return frame;
  }

  private onTurn(turn: TurnEvent) {
    this.lastActivityAt = Date.now();
    if (turn.type === 'start') {
      this.floor = 'user';
      this.thinking = undefined;
      // Barge-in cuts speech only, counting text already handed to TTS whose
      // audio has not arrived yet. A reply still thinking keeps going, and
      // the next utterance joins its run as a follow-up.
      if (this.playback.length || this.ttsTurn === 'open') {
        this.interrupt();
      }
      return;
    }
    this.floor = 'open';
    if (!turn.transcript) {
      return;
    }
    const name = this.lastSpeaker
      ? this.names.get(this.lastSpeaker)
      : undefined;
    const line = `${name ?? 'someone'}: ${turn.transcript}`;
    this.remember(line);
    // Turns queue so a slow addressee check never reorders the transcript.
    this.turns = this.turns
      .then(() => this.endTurn({ transcript: turn.transcript, name }))
      .catch((error: unknown) =>
        logger.warn('[huddle] turn failed', { callId: this.callId, error })
      );
  }

  private async endTurn({
    transcript,
    name,
  }: {
    transcript: string;
    name?: string;
  }) {
    const humans = [...this.attendees.values()].filter(
      ({ attendeeId }) => attendeeId !== this.link.attendeeId
    ).length;
    const named = /\bg[ao]r[gk]/i.test(transcript);
    const followUp = Date.now() - this.lastSpokeAt < config.followUpWindow;
    // A huddle is a room: answer when named, or when there is only one person
    // to talk to. A follow-up without the name, with others around, is
    // checked by a fast model so side chatter right after gorkie spoke does
    // not get a reply. Everything else is kept as context.
    const addressed =
      named || humans <= 1 || (followUp && (await this.aimedAtGorkie()));
    if (addressed) {
      this.thinking = { since: Date.now(), at: 0 };
      this.lastInputAt = Date.now();
      this.unsaved.push(name ? `${name}: ${transcript}` : transcript);
    }
    voiceAgent
      .sendMessage(
        {
          contents: transcript,
          attributes: name ? { name } : undefined,
        },
        {
          ...this.thread,
          ifActive: { behavior: addressed ? 'deliver' : 'persist' },
          ifIdle: {
            behavior: addressed ? 'wake' : 'persist',
            streamOptions: { requestContext: this.requestContext() },
          },
        }
      )
      .accepted.catch((error: unknown) =>
        logger.warn('[huddle] message not accepted', { error })
      );
  }

  private async aimedAtGorkie() {
    try {
      const result = await addresseeAgent.generate(this.recent.join('\n'), {
        abortSignal: AbortSignal.timeout(config.addressee.timeout),
      });
      return /^\s*yes/i.test(result.text);
    } catch {
      // Slow or failed: a missed follow-up is cheaper than butting in.
      return false;
    }
  }

  private remember(line: string) {
    this.recent.push(line);
    this.recent = this.recent.slice(-config.addressee.lines);
  }

  // Stops the talker and its audio, and tells TTS how far playback got.
  // An aborted run saves nothing, so once TTS reports what the room heard,
  // that and any utterance the run never saved go into the thread as a
  // note instead.
  private interrupt() {
    const runId = this.subscription?.activeRunId();
    if (runId) {
      this.abortedRunId = runId;
      this.subscription?.abort();
    }
    this.voice.interrupt(this.played);
    this.playback = [];
    this.playbackOffset = 0;
    this.ttsTurn = 'idle';
    // The interrupted note records what the room actually heard instead.
    this.reply = '';
    this.cutOff = this.unsaved.splice(0);
  }

  private noteInterruption(textSpoken: string) {
    const cutOff = this.cutOff.splice(0);
    if (!(textSpoken || cutOff.length)) {
      return;
    }
    this.signal({
      tagName: 'interrupted',
      contents: [
        textSpoken ? `You were talked over after saying: "${textSpoken}"` : '',
        cutOff.length
          ? `You were answering: ${cutOff.map((line) => `"${line}"`).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('. '),
      wake: false,
    });
  }

  private signal({
    tagName,
    contents,
    wake,
  }: {
    tagName: string;
    contents: string;
    wake: boolean;
  }) {
    if (wake) {
      this.lastInputAt = Date.now();
      this.thinking ??= { since: Date.now(), at: 0 };
    }
    voiceAgent
      .sendSignal(
        { type: 'notification', tagName, contents },
        {
          ...this.thread,
          ifActive: { behavior: wake ? 'deliver' : 'persist' },
          ifIdle: {
            behavior: wake ? 'wake' : 'persist',
            streamOptions: { requestContext: this.requestContext() },
          },
        }
      )
      .accepted.catch((error: unknown) =>
        logger.warn('[huddle] signal not accepted', { tagName, error })
      );
  }

  private tick() {
    const now = Date.now();
    if (this.thinking && now - this.thinking.since > config.thinking.timeout) {
      this.thinking = undefined;
    }
    const floorFree = !(
      this.floor === 'user' ||
      this.playback.length ||
      this.subscription?.activeRunId()
    );
    // The `untilIdle` wrapper continues on a result by starting a run that
    // no input of ours started. Without that, the result still needs saying.
    this.results = this.results.filter((result) => {
      if (this.lastRunStartAt > result.at && this.lastInputAt < result.at) {
        return false;
      }
      if (!floorFree || now - result.at < 2000) {
        return true;
      }
      this.signal({
        tagName: 'task-result',
        contents: `The ${result.agent} delegation finished. Its result:\n${result.text.slice(0, 6000)}`,
        wake: true,
      });
      return false;
    });
    if (
      floorFree &&
      this.running.size &&
      this.filler.count < config.filler.count &&
      now - Math.max(this.filler.lastAt, this.lastSpokeAt) >
        (this.filler.count ? config.filler.interval : config.filler.first)
    ) {
      this.voice.say(
        fillers[this.filler.count % fillers.length] ?? 'still on it.'
      );
      this.voice.flush();
      this.filler = { count: this.filler.count + 1, lastAt: now };
    }
    this.checkPresence(now);
  }

  private postToThread(text: string) {
    const threadId = threadIdOf({
      channel: this.joined.channelId,
      ts: this.joined.threadTs,
    });
    if (!threadId) {
      return;
    }
    chat()
      .thread(threadId)
      .post(text)
      .catch((error: unknown) =>
        logger.debug('[huddle] could not post to the huddle thread', { error })
      );
  }

  private requestContext() {
    const { channelId, threadTs } = this.joined;
    const requestContext = new RequestContext();
    requestContext.set('channel', {
      channelId,
      threadId: threadIdOf({ channel: channelId, ts: threadTs }),
      // Inviting gorkie is consent for the room, so the room's requests run
      // as the inviter, who passed the opt-in check and owns the access.
      userId: this.inviterId,
      isDM: false,
    });
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

  private checkPresence(now: number) {
    const self = this.link.attendeeId;
    const others = [...this.attendees.values()].some(
      ({ attendeeId }) => attendeeId !== self
    );
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
