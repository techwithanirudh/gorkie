import type { AgentThreadSubscription } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import {
  Application,
  createDecoder,
  createEncoder,
  type OpusDecoderHandle,
} from 'libopus-wasm';
import { z } from 'zod';
import { voiceAgent } from '../agents/voice';
import { getMastra } from '../chat/mastra-instance';
import { resolveUserProfile } from '../chat/names';
import { huddle as config } from '../config';
import { threadIdOf } from '../lib/ids';
import { logger } from '../lib/logger';
import { leaveCallTool } from '../tools/leave-huddle';
import { taskStatusTool } from '../tools/task-status';
import type {
  JoinedHuddle,
  SignalFrame,
  TaskStatus,
  TurnEvent,
} from '../types';
import { ChimeLink } from './chime/link';
import { DeepgramVoice } from './deepgram';

// 20 ms at 48 kHz, the Opus frame Chime expects.
const frameSamples = 960;
const frameMs = 20;

// A subagent's own stream chunks, as Mastra relays them from a running
// background task: what `task_status` reports as live progress.
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
  // Utterances sent to a run whose first step has not finished, which is
  // when `savePerStep` writes them. A barge-in before then loses them.
  private unsaved: string[] = [];
  // Unsaved utterances from an interrupted run, held until TTS reports what
  // was actually heard.
  private cutOff: string[] = [];
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
  private readonly leave = leaveCallTool(() => {
    this.leavingAt ??= Date.now();
  });
  private readonly taskStatus = taskStatusTool(() => this.runningTasks());
  // Live progress of running delegations, keyed by task id. Mastra stores
  // only status and result on the task record, so this comes off its stream.
  private readonly progress = new Map<
    string,
    { toolCalls: number; currentTool?: string; text: string }
  >();
  // Set when asked to leave; the call ends once the goodbye has played.
  private leavingAt?: number;
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
    this.watchProgress().catch((error: unknown) =>
      logger.warn('[huddle] task progress stream ended', { error })
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
        this.ttsTurn = 'idle';
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

  private async runningTasks(): Promise<TaskStatus[]> {
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
    const frame = new Int16Array(frameSamples);
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
    const humans = [...this.attendees.values()].filter(
      ({ attendeeId }) => attendeeId !== this.link.attendeeId
    ).length;
    // A huddle is a room: answer when named, during a back and forth, or
    // when there is only one person to talk to. Everything else is kept as
    // context without a reply.
    const addressed =
      humans <= 1 ||
      /\bg[ao]r[gk]/i.test(turn.transcript) ||
      Date.now() - this.lastSpokeAt < config.followUpWindow;
    if (addressed) {
      this.unsaved.push(name ? `${name}: ${turn.transcript}` : turn.transcript);
    }
    voiceAgent
      .sendMessage(
        {
          contents: turn.transcript,
          attributes: name ? { name } : undefined,
        },
        {
          ...this.thread,
          ifActive: { behavior: addressed ? 'deliver' : 'persist' },
          ifIdle: {
            behavior: addressed ? 'wake' : 'persist',
            streamOptions: this.streamOptions(),
          },
        }
      )
      .accepted.catch((error: unknown) =>
        logger.warn('[huddle] message not accepted', { error })
      );
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
    voiceAgent
      .sendSignal(
        { type: 'notification', tagName, contents },
        {
          ...this.thread,
          ifActive: { behavior: wake ? 'deliver' : 'persist' },
          ifIdle: {
            behavior: wake ? 'wake' : 'persist',
            streamOptions: this.streamOptions(),
          },
        }
      )
      .accepted.catch((error: unknown) =>
        logger.warn('[huddle] signal not accepted', { tagName, error })
      );
  }

  private tick() {
    const now = Date.now();
    const floorFree = !(
      this.floor === 'user' ||
      this.playback.length ||
      this.subscription?.activeRunId()
    );
    // Hang up once the goodbye has played. Its audio lands a moment after
    // the run ends, hence the grace periods, and a goodbye that never comes
    // gets a timeout.
    if (
      this.leavingAt &&
      ((floorFree &&
        now - this.leavingAt > 2000 &&
        now - this.lastSpokeAt > 1500) ||
        now - this.leavingAt > config.leaveTimeout)
    ) {
      this.end('asked to leave').catch(() => undefined);
      return;
    }
    this.checkPresence(now);
  }

  private streamOptions() {
    return {
      requestContext: this.requestContext(),
      toolsets: {
        huddle: { leave: this.leave, task_status: this.taskStatus },
      },
    };
  }

  private requestContext() {
    const { channelId, threadTs } = this.joined;
    const requestContext = new RequestContext();
    requestContext.set('channel', {
      channelId,
      threadId: threadIdOf({ channel: channelId, ts: threadTs }),
      // A person speaking in the huddle is a live request, so the thread
      // root stands in for the triggering message that Slack search needs.
      messageId: threadTs,
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
