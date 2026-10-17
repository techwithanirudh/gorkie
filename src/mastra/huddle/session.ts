import { RequestContext } from '@mastra/core/request-context';
import {
  Application,
  createDecoder,
  createEncoder,
  type OpusDecoderHandle,
} from 'libopus-wasm';
import { addresseeAgent } from '../agents/addressee';
import { voiceAgent } from '../agents/voice';
import { slack as bot } from '../chat/client';
import { chat } from '../chat/instance';
import { getMastra } from '../chat/mastra-instance';
import { resolveUserProfile } from '../chat/names';
import { huddle as config } from '../config';
import { threadIdOf } from '../lib/ids';
import { logger } from '../lib/logger';
import { delegateTool } from '../tools/delegate';
import type {
  HuddleRun,
  HuddleTask,
  JoinedHuddle,
  SignalFrame,
  TurnEvent,
} from '../types';
import { ChimeLink } from './chime/link';
import { DeepgramVoice } from './deepgram';

// 20 ms at 48 kHz, the Opus frame Chime expects.
const frameSamples = 960;
const frameMs = 20;

// One huddle, run as a Mastra memory thread on the thin `voice` agent. Lines
// said in the room collect as a backlog, and when one is addressed to gorkie
// the backlog goes to the talker in one `stream` call, whose text goes
// straight into Flux TTS as it is written. Real work goes through the
// session's `delegate` tool, which runs gorkie's full agent in the
// background as the inviter, and its result comes back as a note.
export class HuddleSession {
  private readonly joined: JoinedHuddle;
  private readonly inviterId: string;
  private readonly onEnd: () => void;
  private readonly voice: DeepgramVoice;
  private readonly link: ChimeLink;
  private readonly thread: { resource: string; thread: string };
  private readonly delegate = delegateTool((task) => this.runTask(task));
  private decoder?: OpusDecoderHandle;
  // TTS audio waiting to play, each chunk tagged with where it starts on
  // the TTS timeline, which is what a barge-in reports back.
  private playback: { pcm: Int16Array; at: number }[] = [];
  private playbackOffset = 0;
  private played = 0;
  private ttsTurn: 'idle' | 'open' = 'idle';
  // When gorkie started owing a reply, until its first audio arrives. Shown
  // as the bot's "is thinking..." status in the huddle thread, like text chat.
  private thinkingSince?: number;
  // Stage times for the latest addressed turn, logged at its first audio.
  private timing?: Record<string, number>;
  // The last few lines of the room, gorkie's included, for the addressee
  // check.
  private recent: string[] = [];
  // Lines and notes the talker has not seen yet. They go in with the next
  // addressed turn, so side talk costs nothing until someone asks gorkie.
  private backlog: string[] = [];
  private run?: HuddleRun;
  private readonly results: { text: string; at: number }[] = [];
  private readonly tasks = new Map<number, HuddleTask>();
  private taskCount = 0;
  private turns: Promise<void> = Promise.resolve();
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
      resource: `huddle:${joined.channelId}`,
      thread: `huddle:${joined.callId}`,
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
      this.setThinking(false);
      this.logTiming('firstAudio');
      this.playback.push(audio);
      this.lastSpokeAt = Date.now();
    });
    voice.on('interrupted', ({ textSpoken }) => {
      if (textSpoken) {
        this.backlog.push(
          `[note] You were talked over after saying: "${textSpoken}"`
        );
      }
    });
    voice.on('error', (error) =>
      logger.warn('[huddle] deepgram error', { callId: this.callId, error })
    );
    await voice.connect();
    await link.start();

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
    this.backlog.push(
      '[note] You just joined the huddle. Greet the room in a few words.'
    );
    this.talk();
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
    this.run?.controller.abort();
    this.voice.close();
    await this.link.leave().catch(() => undefined);
    this.onEnd();
  }

  // Sends the backlog to the talker and speaks its reply as it streams. A
  // newer addressed turn replaces a run still thinking, and the replaced
  // run's lines go back on the backlog: an aborted run saves nothing to
  // memory, so they would otherwise be lost.
  private talk() {
    this.cancelRun();
    const lines = this.backlog.splice(0);
    if (this.ending || !lines.length) {
      return;
    }
    const run: HuddleRun = {
      controller: new AbortController(),
      delegated: false,
      lines,
      reply: '',
    };
    this.run = run;
    this.setThinking(true);
    this.stream(run)
      .catch((error: unknown) => {
        if (!run.controller.signal.aborted) {
          logger.warn('[huddle] reply failed', { callId: this.callId, error });
        }
      })
      .finally(() => this.finishRun(run));
  }

  private async stream(run: HuddleRun) {
    this.mark('streamStart');
    const output = await voiceAgent.stream(
      [...run.lines, ...this.runningNote()].join('\n'),
      {
        memory: this.thread,
        requestContext: this.requestContext(),
        toolsets: { huddle: { delegate: this.delegate } },
        abortSignal: run.controller.signal,
      }
    );
    this.mark('streamReady');
    for await (const chunk of output.fullStream) {
      if (run.controller.signal.aborted) {
        return;
      }
      if (chunk.type === 'text-delta' && chunk.payload.text) {
        this.mark('firstText');
        run.reply += chunk.payload.text;
        this.voice.say(chunk.payload.text);
        this.ttsTurn = 'open';
        continue;
      }
      if (chunk.type === 'tool-call') {
        this.mark('toolCall');
        run.delegated = true;
        // Flux TTS holds a short ack like "on it" waiting for more text, so
        // say what is there now.
        this.flushSpeech();
      }
    }
  }

  // Called by `cancelRun` and again when the stream settles, so only the
  // first call counts.
  private finishRun(run: HuddleRun) {
    if (this.run !== run) {
      return;
    }
    this.run = undefined;
    if (run.controller.signal.aborted) {
      // A handed-off task keeps running after the abort, so say so, or the
      // requeued lines would be delegated twice.
      this.backlog.unshift(
        ...run.lines,
        ...(run.delegated
          ? [
              '[note] You already delegated that. Its answer comes back as a [task result] note, so do not delegate it again.',
            ]
          : [])
      );
      return;
    }
    if (run.reply.trim()) {
      this.remember(`gorkie: ${run.reply.trim()}`);
    }
    if (this.ttsTurn === 'open') {
      this.flushSpeech();
      return;
    }
    // A run that ended without a word (a quiet delegation, a deliberate
    // silence, an error) owes no audio, so nothing will clear the status.
    this.setThinking(false);
    this.logTiming('silentEnd');
  }

  private cancelRun() {
    if (!this.run) {
      return;
    }
    this.run.controller.abort();
    this.finishRun(this.run);
  }

  private flushSpeech() {
    if (this.ttsTurn === 'open') {
      this.voice.flush();
      this.ttsTurn = 'idle';
    }
  }

  // Runs gorkie's full agent on a delegated task, as the inviter and anchored
  // on the huddle thread, so tools that need a live Slack message (search)
  // work. It outlives the huddle: the result is posted to the thread either
  // way, and spoken if gorkie is still in the call.
  private runTask(brief: string) {
    const id = ++this.taskCount;
    const task: HuddleTask = { brief, startedAt: Date.now() };
    this.tasks.set(id, task);
    logger.info('[huddle] delegated', { callId: this.callId, brief });
    this.followTask({ id, task })
      .then((text) => {
        logger.info('[huddle] delegation finished', {
          callId: this.callId,
          ms: Date.now() - task.startedAt,
        });
        this.postToThread(text);
        this.results.push({ text, at: Date.now() });
      })
      .catch((error: unknown) => {
        logger.warn('[huddle] delegation failed', {
          callId: this.callId,
          ms: Date.now() - task.startedAt,
          error,
        });
        this.results.push({
          text: 'The task failed before it finished.',
          at: Date.now(),
        });
      })
      .finally(() => this.tasks.delete(id));
  }

  // Streams rather than generates so the talker can say what a running
  // task is doing, from the tool it called last. Each task gets its own
  // memory thread, since two can run at once and the brief is self
  // contained.
  private async followTask({ id, task }: { id: number; task: HuddleTask }) {
    const output = await getMastra()
      .getAgent('orchestrator')
      .stream(
        `Asked out loud in a Slack huddle, relayed by your voice:\n\n${task.brief}`,
        {
          memory: {
            resource: this.thread.resource,
            thread: `huddle-task:${this.callId}:${id}`,
          },
          requestContext: this.requestContext(),
          abortSignal: AbortSignal.timeout(config.delegateTimeout),
        }
      );
    for await (const chunk of output.fullStream) {
      if (chunk.type === 'tool-call') {
        task.step = chunk.payload.toolName;
      }
    }
    return output.text;
  }

  // Delegations still running, for the talker to answer "how's it going".
  private runningNote() {
    const now = Date.now();
    const running = [...this.tasks.values()].map(
      ({ brief, startedAt, step }) =>
        `"${brief.slice(0, 200)}" for ${Math.round((now - startedAt) / 1000)} s${step ? `, now using ${step}` : ''}`
    );
    return running.length ? [`[running] ${running.join('; ')}`] : [];
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
      // audio has not arrived yet. A reply still thinking keeps going, since
      // the new speech may not be for gorkie at all.
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
    this.backlog.push(line);
    this.backlog = this.backlog.slice(-config.backlogLines);
    // Turns queue so a slow addressee check never reorders the transcript.
    this.turns = this.turns
      .then(() => this.endTurn(turn.transcript))
      .catch((error: unknown) =>
        logger.warn('[huddle] turn failed', { callId: this.callId, error })
      );
  }

  private async endTurn(transcript: string) {
    const endedAt = Date.now();
    const named = /\bg[ao]r[gk]/i.test(transcript);
    const followUp = Date.now() - this.lastSpokeAt < config.followUpWindow;
    // gorkie speaks only when spoken to: named, or, in the window right after
    // it spoke, when a fast model reads the line as aimed at it. Everyone
    // else's talk, alone with gorkie or not, waits in the backlog as context.
    if (!(named || (followUp && (await this.aimedAtGorkie())))) {
      return;
    }
    this.timing = { endOfSpeech: endedAt, addressed: Date.now() };
    this.talk();
  }

  // Keeps the first time each stage was reached in the current turn.
  private mark(stage: string) {
    if (this.timing && !(stage in this.timing)) {
      this.timing[stage] = Date.now();
    }
  }

  private logTiming(stage: string) {
    if (!this.timing) {
      return;
    }
    this.mark(stage);
    const { endOfSpeech = 0, ...stages } = this.timing;
    logger.info('[huddle] turn timing (ms after end of speech)', {
      callId: this.callId,
      ...Object.fromEntries(
        Object.entries(stages).map(([key, at]) => [key, at - endOfSpeech])
      ),
    });
    this.timing = undefined;
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
  // TTS answers with the text the room heard, which becomes a note.
  private interrupt() {
    this.cancelRun();
    this.voice.interrupt(this.played);
    this.playback = [];
    this.playbackOffset = 0;
    this.ttsTurn = 'idle';
  }

  private tick() {
    const now = Date.now();
    if (
      this.thinkingSince &&
      now - this.thinkingSince > config.thinkingTimeout
    ) {
      this.setThinking(false);
    }
    const floorFree = !(
      this.floor === 'user' ||
      this.playback.length ||
      this.run
    );
    // A result waits for a quiet moment rather than talking over the room.
    if (floorFree && this.results.length) {
      for (const result of this.results.splice(0)) {
        this.backlog.push(`[task result] ${result.text.slice(0, 6000)}`);
      }
      this.talk();
    }
    this.checkPresence(now);
  }

  private setThinking(thinking: boolean) {
    if (Boolean(this.thinkingSince) === thinking) {
      return;
    }
    this.thinkingSince = thinking ? Date.now() : undefined;
    bot.webClient.assistant.threads
      .setStatus({
        channel_id: this.joined.channelId,
        thread_ts: this.joined.threadTs,
        status: thinking ? 'is thinking...' : '',
      })
      .catch((error: unknown) =>
        logger.debug('[huddle] could not set the thinking status', { error })
      );
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
      platform: 'slack',
      eventType: 'huddle',
      channelId,
      threadId: threadIdOf({ channel: channelId, ts: threadTs }),
      // The huddle thread's root stands in for the live message a text turn
      // would have, which Slack search needs as its anchor.
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
