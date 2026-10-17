import { SlackFormatConverter } from '@chat-adapter/slack';
import type {
  AgentThreadSubscription,
  SendAgentMessageOptions,
} from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import {
  Application,
  createDecoder,
  createEncoder,
  type OpusDecoderHandle,
  type OpusEncoderHandle,
} from 'libopus-wasm';
import { z } from 'zod';
import { voiceAgent } from '../agents/voice';
import { slack } from '../chat/client';
import { getMastra } from '../chat/mastra-instance';
import { resolveUserProfile } from '../chat/names';
import { huddle as config } from '../config';
import { chatChannelId } from '../lib/ids';
import { logger } from '../lib/logger';
import { joinChannel } from '../tools/slack/utils';
import type {
  JoinedHuddle,
  LiveHuddle,
  SignalFrame,
  TaskStatus,
  TurnEvent,
} from '../types';
import { ChimeLink, opusFrameSamples } from './chime/link';
import { DeepgramVoice } from './deepgram';

const frameMs = 20;
const speakingAttenuation = 36;
const wakeWord = /\bg[ao]r[gk](ie|ey|y|i)\b/i;
const maxCatchUpFrames = 10;

const taskOutputSchema = z.looseObject({
  type: z.literal('background-task-output'),
  payload: z.looseObject({
    taskId: z.string(),
    payload: z.looseObject({
      payload: z.looseObject({
        output: z.discriminatedUnion('type', [
          z.looseObject({
            type: z.literal('text-delta'),
            payload: z.looseObject({ text: z.string() }),
          }),
          z.looseObject({
            type: z.literal('tool-call'),
            payload: z.looseObject({ toolName: z.string() }),
          }),
        ]),
      }),
    }),
  }),
});

const taskArgsSchema = z.looseObject({ prompt: z.string().optional() });

const taskEndSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('background-task-completed'),
    payload: z.looseObject({
      taskId: z.string(),
      toolName: z.string(),
      result: z.looseObject({ text: z.string() }),
    }),
  }),
  z.looseObject({
    type: z.literal('background-task-failed'),
    payload: z.looseObject({ taskId: z.string(), toolName: z.string() }),
  }),
]);

export class HuddleSession implements LiveHuddle {
  readonly callId: string;
  readonly channelId: string;
  readonly slackThreadId: string;
  private readonly threadTs: string;
  private readonly actingAs: string;
  private readonly onEnd: () => void;
  private readonly voice: DeepgramVoice;
  private readonly link: ChimeLink;
  private readonly thread: { resourceId: string; threadId: string };
  private decoder?: OpusDecoderHandle;
  private encoder?: OpusEncoderHandle;
  private subscription?: AgentThreadSubscription;
  private playback: { pcm: Int16Array; timelineOffset: number }[] = [];
  private playbackOffset = 0;
  private played = 0;
  // `flushing` covers the gap between the last text and Flux's first audio,
  // when nothing is queued yet but a reply is still coming.
  private ttsTurn: 'idle' | 'open' | 'flushing' = 'idle';
  // Utterances sent to a run whose first step has not finished, which is
  // when `savePerStep` writes them. A barge-in before then loses them.
  private unsaved: string[] = [];
  private unheardTurns: string[] = [];
  private abortedRunId?: string;
  private lastSpokeAt = 0;
  private floor: 'open' | 'user' = 'open';
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
  // Mastra stores only status and result on the task record, so progress
  // comes off its stream.
  private readonly progress = new Map<
    string,
    { toolCalls: number; currentTool?: string; text: string }
  >();
  private leavingAt?: number;
  private ending?: Promise<void>;

  constructor({
    joined,
    actingAs,
    apiKey,
    onEnd,
  }: {
    joined: JoinedHuddle;
    actingAs: string;
    apiKey: string;
    onEnd: () => void;
  }) {
    this.callId = joined.callId;
    this.channelId = joined.channelId;
    this.actingAs = actingAs;
    this.threadTs = joined.threadTs;
    this.slackThreadId = `${chatChannelId(joined.channelId)}:${joined.threadTs}`;
    this.onEnd = onEnd;
    this.thread = {
      resourceId: `huddle:${joined.channelId}`,
      threadId: `huddle:${joined.callId}`,
    };
    this.voice = new DeepgramVoice({ apiKey });
    this.link = new ChimeLink({
      chime: joined.chime,
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
      onJoining: () => this.attendees.clear(),
      onTerminal: (reason) => {
        this.end(reason).catch(() => undefined);
      },
      onWarn: (event, fields) =>
        logger.warn(`[huddle] ${event}`, { callId: this.callId, ...fields }),
    });
  }

  private get speaking() {
    return this.playback.length > 0 || this.ttsTurn !== 'idle';
  }

  private get others() {
    return [...this.attendees.values()].filter(
      ({ attendeeId }) => attendeeId !== this.link.attendeeId
    ).length;
  }

  async start() {
    const { link, voice } = this;
    const { signal } = this.controller;
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
    this.encoder = encoder;
    if (signal.aborted) {
      this.releaseCodecs();
      return;
    }
    voice.on('turn', (turn) => this.onTurn(turn));
    voice.on('audio', (audio) => {
      this.playback.push(audio);
      this.lastSpokeAt = Date.now();
      this.lastActivityAt = this.lastSpokeAt;
    });
    voice.on('flushed', () => {
      if (this.ttsTurn === 'flushing') {
        this.ttsTurn = 'idle';
      }
    });
    voice.on('interrupted', ({ textSpoken }) =>
      this.noteInterruption(textSpoken)
    );
    voice.on('error', (error) =>
      logger.warn('[huddle] deepgram error', { callId: this.callId, error })
    );
    await voice.connect();
    await link.start();
    if (signal.aborted) {
      this.releaseCodecs();
      return;
    }

    const subscription = await voiceAgent.subscribeToThread(this.thread);
    if (signal.aborted) {
      subscription.unsubscribe();
      this.releaseCodecs();
      return;
    }
    this.subscription = subscription;
    this.consume(subscription).catch((error: unknown) =>
      logger.warn('[huddle] thread subscription ended', { error })
    );
    this.watchProgress().catch((error: unknown) =>
      logger.warn('[huddle] task progress stream ended', { error })
    );

    let base = performance.now();
    let sent = 0;
    this.timers.push(
      setInterval(() => {
        if (
          Math.floor((performance.now() - base) / frameMs) - sent >
          maxCatchUpFrames
        ) {
          base = performance.now() - frameMs;
          sent = 0;
        }
        const due = Math.floor((performance.now() - base) / frameMs);
        for (; sent < due; sent++) {
          const opus = this.encoder?.encode(this.nextFrame());
          if (opus) {
            link.sendAudio(opus);
          }
        }
      }, 10),
      setInterval(() => this.tick(), 1000)
    );
    logger.info('[huddle] joined', {
      callId: this.callId,
      channelId: this.channelId,
    });
    this.signal({
      tagName: 'joined',
      contents: 'You just joined the huddle. Greet the room in a few words.',
      wake: true,
    });
  }

  hangUp() {
    this.leavingAt ??= Date.now();
  }

  end(reason: string) {
    this.ending ??= this.shutdown(reason);
    return this.ending;
  }

  private async shutdown(reason: string) {
    logger.info('[huddle] leaving', { callId: this.callId, reason });
    this.postLateResults().catch((error: unknown) =>
      logger.warn('[huddle] late results not posted', { error })
    );
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.controller.abort();
    this.subscription?.abort();
    this.subscription?.unsubscribe();
    this.voice.close();
    await this.link.leave().catch(() => undefined);
    this.releaseCodecs();
    this.onEnd();
  }

  private releaseCodecs() {
    const { decoder, encoder } = this;
    this.decoder = undefined;
    this.encoder = undefined;
    decoder?.free();
    encoder?.free();
  }

  private async consume(subscription: AgentThreadSubscription) {
    for await (const chunk of subscription.stream) {
      if (chunk.runId === this.abortedRunId) {
        if (
          chunk.type === 'abort' ||
          chunk.type === 'finish' ||
          chunk.type === 'error'
        ) {
          this.abortedRunId = undefined;
        }
        continue;
      }
      if (chunk.type === 'text-delta') {
        if (chunk.payload.text) {
          this.voice.say(chunk.payload.text);
          this.ttsTurn = 'open';
        }
        continue;
      }
      if (chunk.type === 'step-finish') {
        this.unsaved = [];
        continue;
      }
      if (
        (chunk.type === 'finish' || chunk.type === 'error') &&
        this.ttsTurn === 'open'
      ) {
        this.voice.flush();
        this.ttsTurn = 'flushing';
      }
    }
  }

  private async watchProgress() {
    const manager = getMastra().backgroundTaskManager;
    if (!manager) {
      return;
    }
    for await (const raw of manager.stream({
      threadId: this.thread.threadId,
      abortSignal: this.controller.signal,
    })) {
      const ended = taskEndSchema.safeParse(raw);
      if (ended.success) {
        this.deliver(ended.data);
        continue;
      }
      const parsed = taskOutputSchema.safeParse(raw);
      if (!parsed.success) {
        continue;
      }
      const { taskId } = parsed.data.payload;
      const chunk = parsed.data.payload.payload.payload.output;
      const entry = this.progress.get(taskId) ?? { toolCalls: 0, text: '' };
      if (chunk.type === 'tool-call') {
        entry.toolCalls++;
        entry.currentTool = chunk.payload.toolName;
      } else {
        entry.text = `${entry.text}${chunk.payload.text}`.slice(-400);
      }
      this.progress.set(taskId, entry);
    }
  }

  private deliver(ended: z.infer<typeof taskEndSchema>) {
    const agent = ended.payload.toolName.replace(/^agent-/, '');
    this.signal({
      tagName: 'delegation',
      contents:
        ended.type === 'background-task-completed'
          ? `The ${agent} delegation finished. Its result:\n${ended.payload.result.text}`
          : `The ${agent} delegation failed.`,
      wake: true,
    });
  }

  // Nobody is left to hear a delegation that outlives the huddle, so its
  // result goes to the huddle thread in writing instead.
  private async postLateResults() {
    const manager = getMastra().backgroundTaskManager;
    if (!manager) {
      return;
    }
    const { tasks } = await manager.listTasks({
      threadId: this.thread.threadId,
      status: 'running',
    });
    const waiting = new Set(tasks.map(({ id }) => id));
    if (!waiting.size) {
      return;
    }
    for await (const raw of manager.stream({
      threadId: this.thread.threadId,
      abortSignal: AbortSignal.timeout(
        Math.max(config.task.researchTimeout, config.task.exploreTimeout)
      ),
    })) {
      const parsed = taskEndSchema.safeParse(raw);
      if (!(parsed.success && waiting.delete(parsed.data.payload.taskId))) {
        continue;
      }
      const { data } = parsed;
      const agent = data.payload.toolName.replace(/^agent-/, '');
      const markdown =
        data.type === 'background-task-completed'
          ? `The ${agent} I started in the huddle finished after it ended:\n\n${data.payload.result.text}`
          : `The ${agent} I started in the huddle failed after it ended.`;
      await joinChannel(this.channelId);
      await slack.webClient.chat.postMessage({
        channel: this.channelId,
        thread_ts: this.threadTs,
        ...new SlackFormatConverter().toSlackPayload({ markdown }),
      });
      if (!waiting.size) {
        return;
      }
    }
  }

  async runningTasks(): Promise<TaskStatus[]> {
    const manager = getMastra().backgroundTaskManager;
    if (!manager) {
      return [];
    }
    const { tasks } = await manager.listTasks({
      threadId: this.thread.threadId,
      status: 'running',
    });
    const now = Date.now();
    const ids = new Set(tasks.map(({ id }) => id));
    for (const taskId of this.progress.keys()) {
      if (!ids.has(taskId)) {
        this.progress.delete(taskId);
      }
    }
    return tasks.map((task) => {
      const entry = this.progress.get(task.id);
      return {
        agent: task.toolName,
        brief: taskArgsSchema.safeParse(task.args).data?.prompt ?? '',
        runningSeconds: Math.round(
          (now - (task.startedAt ?? task.createdAt).getTime()) / 1000
        ),
        toolCalls: entry?.toolCalls ?? 0,
        currentTool: entry?.currentTool,
        latestText: entry?.text.trim() || undefined,
      };
    });
  }

  private nextFrame() {
    const frame = new Int16Array(opusFrameSamples);
    let written = 0;
    while (written < opusFrameSamples) {
      const [chunk] = this.playback;
      if (!chunk) {
        break;
      }
      const take = Math.min(
        opusFrameSamples - written,
        chunk.pcm.length - this.playbackOffset
      );
      frame.set(
        chunk.pcm.subarray(this.playbackOffset, this.playbackOffset + take),
        written
      );
      written += take;
      this.playbackOffset += take;
      this.played = chunk.timelineOffset + this.playbackOffset;
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
      if (this.speaking) {
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
    const addressed =
      this.others <= 1 ||
      wakeWord.test(turn.transcript) ||
      Date.now() - this.lastSpokeAt < config.unnamedReplyWindow;
    if (addressed) {
      this.unsaved.push(name ? `${name}: ${turn.transcript}` : turn.transcript);
    }
    voiceAgent
      .sendMessage(
        {
          contents: turn.transcript,
          attributes: name ? { name } : undefined,
        },
        this.delivery(addressed)
      )
      .accepted.catch((error: unknown) =>
        logger.warn('[huddle] message not accepted', { error })
      );
  }

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
    this.unheardTurns = this.unsaved.splice(0);
  }

  private noteInterruption(textSpoken: string) {
    const unheard = this.unheardTurns.splice(0);
    if (!(textSpoken || unheard.length)) {
      return;
    }
    this.signal({
      tagName: 'interrupted',
      contents: [
        textSpoken ? `You were talked over after saying: "${textSpoken}"` : '',
        unheard.length
          ? `You were answering: ${unheard.map((line) => `"${line}"`).join(', ')}`
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
    voiceAgent
      .sendSignal(
        { type: 'notification', tagName, contents },
        this.delivery(wake)
      )
      .accepted.catch((error: unknown) =>
        logger.warn('[huddle] signal not accepted', { tagName, error })
      );
  }

  private tick() {
    const now = Date.now();
    const floorFree = !(
      this.floor === 'user' ||
      this.speaking ||
      this.subscription?.activeRunId()
    );
    if (
      this.leavingAt &&
      ((floorFree &&
        now - this.leavingAt > config.goodbye.afterLeaveMs &&
        now - this.lastSpokeAt > config.goodbye.afterAudioMs) ||
        now - this.leavingAt > config.goodbye.maxMs)
    ) {
      this.end('asked to leave').catch(() => undefined);
      return;
    }
    this.checkPresence(now);
  }

  private delivery(wake: boolean): SendAgentMessageOptions {
    const requestContext = new RequestContext();
    requestContext.set('channel', {
      channelId: this.channelId,
      threadId: this.slackThreadId,
      eventType: 'huddle',
      userId: this.actingAs,
      isDM: false,
    });
    return {
      ...this.thread,
      ifActive: { behavior: wake ? 'deliver' : 'persist' },
      ifIdle: {
        behavior: wake ? 'wake' : 'persist',
        // Off so a finished delegation comes back only through `deliver`,
        // instead of also through Mastra's idle continuation (patched in
        // patches/@mastra+core@1.66.0.patch to respect this).
        streamOptions: { requestContext, untilIdle: false },
      },
    };
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
      const attendee = this.attendees.get(state.audio_stream_id);
      if (
        attendee?.userId &&
        attendee.attendeeId !== self &&
        state.volume !== undefined &&
        state.volume < speakingAttenuation
      ) {
        this.lastSpeaker = attendee.userId;
      }
    }
  }

  private checkPresence(now: number) {
    // Every reconnect attempt starts the attendee list over, so an outage
    // would otherwise read as everyone leaving.
    if (this.link.reconnecting) {
      this.aloneSince = undefined;
      return;
    }
    this.aloneSince = this.others > 0 ? undefined : (this.aloneSince ?? now);
    if (this.aloneSince && now - this.aloneSince > config.aloneTimeout) {
      this.end('everyone left').catch(() => undefined);
      return;
    }
    if (now - this.lastActivityAt <= config.idleTimeout) {
      return;
    }
    this.lastActivityAt = now;
    this.runningTasks()
      .then((tasks) => (tasks.length ? undefined : this.end('idle')))
      .catch(() => undefined);
  }
}
