import { SlackAdapter } from '@chat-adapter/slack';
import type { SlackBlock } from '@chat-adapter/slack/blocks';
import { Message, type PlanModel } from 'chat';
import { z } from 'zod';
import { slack as config } from '../config';
import { activityAnswerSchema } from '../types/progress';
import { codeChannelSchema } from '../types/tools/code-channel';
import { ignoredMessageReason, userMention } from './message';

interface ThreadStopEvent {
  stoppedAt: number;
  threadId: string;
  userId: string;
}

interface MemberLeftEvent {
  channel: string;
  userId: string;
}

const mentionPattern = new RegExp(userMention.source, 'g');

const recipientSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

type Recipient = z.infer<typeof recipientSchema>;

const memberLeftSchema = z.object({
  type: z.literal('member_left_channel'),
  channel: z.string(),
  user: z.string(),
});

const postedThreadSchema = z.object({
  message: z.object({ thread_ts: z.string().optional() }),
});

function evictOldest({
  cache,
  key,
}: {
  cache: Map<string, unknown> | Set<string>;
  key: string;
}): void {
  if (cache.has(key) || cache.size < config.maxCachedThreads) {
    return;
  }
  const [oldest] = cache.keys();
  if (oldest !== undefined) {
    cache.delete(oldest);
  }
}

export class SlackAgentAdapter extends SlackAdapter {
  private readonly codeChannels = new Map<
    string,
    { assigned: boolean; code: boolean; expiresAt: number }
  >();
  private readonly codeChannelLookups = new Map<string, Promise<boolean>>();
  private readonly stoppedCodeChannels = new Set<string>();

  private nativeSessionStopped(threadId: string): boolean {
    const { channel } = this.decodeThreadId(threadId);
    return (
      this.stoppedCodeChannels.has(threadId) ||
      this.stoppedCodeChannels.has(
        this.encodeThreadId({ channel, threadTs: '' })
      )
    );
  }

  private assertSessionWritable(threadId: string): void {
    if (this.nativeSessionStopped(threadId)) {
      throw new Error('Slack code channel session was stopped.');
    }
  }

  async isCodeChannel(channel: string): Promise<boolean> {
    if (channel.startsWith('D')) {
      return false;
    }
    const cached = this.codeChannels.get(channel);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.code;
    }
    const pending = this.codeChannelLookups.get(channel);
    if (pending) {
      return pending;
    }
    const lookup = (async () => {
      try {
        const response = await this._client.conversations.info(
          await this.withToken({ channel })
        );
        const parsed = codeChannelSchema.safeParse(response.channel);
        const assigned =
          parsed.success &&
          !!this.botUserId &&
          (
            parsed.data.properties.agent_session?.encoded_agent_bot_user_ids ??
            []
          ).includes(this.botUserId);
        evictOldest({ cache: this.codeChannels, key: channel });
        this.codeChannels.set(channel, {
          assigned,
          code: parsed.success,
          expiresAt: Date.now() + config.codeChannelCacheTtlMs,
        });
        return parsed.success;
      } catch (error) {
        this.logger.warn('Could not recognize Slack code channel', {
          channel,
          error,
        });
        if (cached) {
          cached.assigned = false;
        }
        return cached?.code ?? false;
      } finally {
        this.codeChannelLookups.delete(channel);
      }
    })();
    this.codeChannelLookups.set(channel, lookup);
    return await lookup;
  }

  async isAssignedCodeChannel(channel: string): Promise<boolean> {
    return (
      (await this.isCodeChannel(channel)) &&
      this.codeChannels.get(channel)?.assigned === true
    );
  }

  protected override threadIdForMessageEvent(
    event: Parameters<SlackAdapter['threadIdForMessageEvent']>[0]
  ): string {
    if (
      event.channel &&
      this.codeChannels.get(event.channel)?.code &&
      !event.thread_ts
    ) {
      return this.encodeThreadId({ channel: event.channel, threadTs: '' });
    }
    return super.threadIdForMessageEvent(event);
  }

  private readonly recipients = new Map<string, Recipient>();

  private threadStopHandler?: (event: ThreadStopEvent) => Promise<void>;

  private memberLeftHandler?: (event: MemberLeftEvent) => Promise<void>;
  // Threads whose root is gone: Slack posts a reply to a deleted root at the
  // channel root instead of rejecting it, so later posts there would too.
  private readonly unthreaded = new Set<string>();

  private recipientKey(threadId: string): string {
    return `stream-recipient:${threadId}`;
  }

  protected override handleMessageEvent(
    ...args: Parameters<SlackAdapter['handleMessageEvent']>
  ): ReturnType<SlackAdapter['handleMessageEvent']> {
    const [event, options] = args;
    if (
      ignoredMessageReason({
        text: event.text ?? '',
        botUserId: this.botUserId,
      })
    ) {
      return;
    }
    if (!event.channel || event.channel_type === 'im' || !this.chat) {
      return this.handleReadyMessageEvent(...args);
    }
    const { channel } = event;
    const { chat } = this;
    const task = (async () => {
      const assigned = await this.isAssignedCodeChannel(channel);
      if (
        this.codeChannels.get(channel)?.code &&
        event.user &&
        !event.bot_id &&
        !event.subtype
      ) {
        this.stoppedCodeChannels.delete(
          this.encodeThreadId({ channel, threadTs: '' })
        );
        this.stoppedCodeChannels.delete(this.threadIdForMessageEvent(event));
        if (assigned && !event.thread_ts) {
          await chat
            .getState()
            .subscribe(this.encodeThreadId({ channel, threadTs: '' }));
        }
      }
      this.handleReadyMessageEvent(...args);
    })().catch((error: unknown) => {
      this.logger.error('Could not route Slack channel message', {
        error,
        channel: event.channel,
      });
      if (options?.propagateHandlerErrors && options.waitUntil) {
        throw error;
      }
    });
    options?.waitUntil?.(task);
  }

  private handleReadyMessageEvent(
    ...args: Parameters<SlackAdapter['handleMessageEvent']>
  ): ReturnType<SlackAdapter['handleMessageEvent']> {
    const [event, options] = args;
    const text = event.text ?? '';
    if (ignoredMessageReason({ text, botUserId: this.botUserId })) {
      return;
    }
    if (
      event.channel &&
      event.ts &&
      event.user &&
      this.threadStopHandler &&
      [...text.matchAll(new RegExp(userMention.source, 'g'))].some(
        (mention) =>
          mention[1] === this.botUserId &&
          /^!stop\b/i.test(
            text.slice(mention.index + mention[0].length).trimStart()
          )
      )
    ) {
      const threadId = this.threadIdForMessageEvent(event);
      const task = this.threadStopHandler({
        threadId,
        userId: event.user,
        stoppedAt: Number(event.ts) * 1000,
      }).catch((error: unknown) => {
        this.logger.error('Thread stop handler failed', { error, threadId });
      });
      options?.waitUntil?.(task);
      return;
    }
    const { chat } = this;
    const userId = event.user;
    const teamId = event.team_id ?? event.team;
    if (
      chat &&
      event.channel_type !== 'im' &&
      event.channel &&
      event.ts &&
      userId &&
      teamId
    ) {
      const threadId = this.threadIdForMessageEvent(event);
      const known = this.recipients.get(threadId);
      if (!(known?.userId === userId && known.teamId === teamId)) {
        const recipient: Recipient = { userId, teamId };
        evictOldest({ cache: this.recipients, key: threadId });
        this.recipients.set(threadId, recipient);
        // Not awaited so a slow state store never delays the message; the
        // stored copy only matters to stream() after a restart.
        chat
          .getState()
          .set(this.recipientKey(threadId), recipient, config.recipientTtlMs)
          .catch((error: unknown) =>
            this.logger.warn('Could not store the stream recipient', {
              error,
              threadId,
            })
          );
      }
    }
    return super.handleMessageEvent(...args);
  }

  protected override handleAgentSessionStopped(
    ...args: Parameters<SlackAdapter['handleAgentSessionStopped']>
  ): void {
    const [event, options] = args;
    const task = (async () => {
      if (!(await this.isCodeChannel(event.channel))) {
        super.handleAgentSessionStopped(...args);
        return;
      }
      const { chat } = this;
      if (!chat) {
        return;
      }
      const threadId = this.encodeThreadId({
        channel: event.channel,
        threadTs: event.thread_ts || '',
      });
      evictOldest({ cache: this.stoppedCodeChannels, key: threadId });
      this.stoppedCodeChannels.add(threadId);
      await chat.abortTurn(threadId);
      chat.processAgentSessionStopped(
        {
          adapter: this,
          channelId: event.channel,
          streamingMessageTs: event.streaming_message_ts,
          threadId,
          threadTs: event.thread_ts || '',
          userId: event.user,
        },
        options
      );
    })().catch((error: unknown) =>
      this.logger.error('Could not stop Slack code channel', {
        channel: event.channel,
        error,
      })
    );
    options?.waitUntil?.(task);
  }

  override async setSessionStatus(
    ...args: Parameters<SlackAdapter['setSessionStatus']>
  ): Promise<void> {
    const [channel, threadTs, status, options] = args;
    if (!(await this.isCodeChannel(channel))) {
      return super.setSessionStatus(...args);
    }
    if (this.nativeSessionStopped(this.encodeThreadId({ channel, threadTs }))) {
      return;
    }
    await this._client.apiCall(
      'agents.sessions.setStatus',
      await this.withToken({
        channel_id: channel,
        status,
        ...(options?.initiatorUserId
          ? { initiator_user_id: options.initiatorUserId }
          : {}),
        ...(options?.title ? { title: options.title } : {}),
      })
    );
  }

  override async setAssistantStatus(
    ...args: Parameters<SlackAdapter['setAssistantStatus']>
  ): Promise<void> {
    const [channel, threadTs, status] = args;
    if (await this.isCodeChannel(channel)) {
      return this.setSessionStatus(
        channel,
        threadTs,
        status ? 'processing' : 'active'
      );
    }
    return super.setAssistantStatus(...args);
  }

  protected override async renameAgentSession(
    ...args: Parameters<SlackAdapter['renameAgentSession']>
  ): Promise<void> {
    const [channel, threadTs, title] = args;
    if (!(await this.isCodeChannel(channel))) {
      return super.renameAgentSession(...args);
    }
    if (this.nativeSessionStopped(this.encodeThreadId({ channel, threadTs }))) {
      return;
    }
    await this._client.apiCall(
      'agents.sessions.rename',
      await this.withToken({ channel_id: channel, title })
    );
  }

  override async startTyping(
    ...args: Parameters<SlackAdapter['startTyping']>
  ): Promise<void> {
    const [threadId, status, options] = args;
    const { channel, threadTs } = this.decodeThreadId(threadId);
    if (!(await this.isCodeChannel(channel))) {
      return super.startTyping(...args);
    }
    try {
      await this.setSessionStatus(
        channel,
        threadTs,
        status === '' ? 'active' : 'processing',
        { initiatorUserId: options?.initiatorUserId }
      );
    } catch (error) {
      this.logger.warn('Could not update Slack code channel thinking state', {
        channel,
        error,
      });
    }
  }

  override async endTyping(
    ...args: Parameters<SlackAdapter['endTyping']>
  ): Promise<void> {
    const [threadId, status = 'active'] = args;
    const { channel, threadTs } = this.decodeThreadId(threadId);
    if (!(await this.isCodeChannel(channel))) {
      return super.endTyping(...args);
    }
    try {
      await this.setSessionStatus(channel, threadTs, status);
    } catch (error) {
      this.logger.warn('Could not clear Slack code channel thinking state', {
        channel,
        error,
      });
    }
  }

  override async fetchMessages(
    ...args: Parameters<SlackAdapter['fetchMessages']>
  ): ReturnType<SlackAdapter['fetchMessages']> {
    const [threadId, options] = args;
    const { channel, threadTs } = this.decodeThreadId(threadId);
    if (!threadTs && (await this.isCodeChannel(channel))) {
      const page = await this.fetchChannelMessages(`slack:${channel}`, options);
      return {
        ...page,
        messages: page.messages.map(
          (message) => new Message({ ...message, threadId })
        ),
      };
    }
    return super.fetchMessages(...args);
  }

  override async stream(
    ...args: Parameters<SlackAdapter['stream']>
  ): ReturnType<SlackAdapter['stream']> {
    const [threadId, textStream, options] = args;
    if (await this.isCodeChannel(this.decodeThreadId(threadId).channel)) {
      return null;
    }
    const { chat } = this;
    if (
      this.isDM(threadId) ||
      (options?.recipientUserId && options?.recipientTeamId) ||
      !chat
    ) {
      return super.stream(threadId, textStream, options);
    }
    let recipient = this.recipients.get(threadId);
    if (!recipient) {
      const stored = recipientSchema.safeParse(
        await chat.getState().get(this.recipientKey(threadId))
      );
      if (stored.success) {
        recipient = stored.data;
        this.recipients.set(threadId, stored.data);
      }
    }
    if (!recipient) {
      return super.stream(threadId, textStream, options);
    }
    return super.stream(threadId, textStream, {
      ...options,
      recipientUserId: recipient.userId,
      recipientTeamId: recipient.teamId,
    });
  }

  protected override planToBlockKit(plan: PlanModel): unknown[] {
    const parsed = activityAnswerSchema.safeParse(plan);
    if (!parsed.success) {
      return super.planToBlockKit(plan);
    }
    const blocks = super.planToBlockKit(plan).map((block, index) => ({
      ...z.looseObject({ type: z.string() }).parse(block),
      block_id: `gorkie_plan_${index}`,
    }));
    if (parsed.data.gorkieActivity.answer) {
      return [
        ...blocks,
        {
          type: 'markdown',
          block_id: 'gorkie_answer',
          text: parsed.data.gorkieActivity.answer,
        },
      ];
    }
    return blocks;
  }

  onThreadStop(handler: (event: ThreadStopEvent) => Promise<void>): void {
    this.threadStopHandler = handler;
  }

  // Chat SDK has onMemberJoinedChannel but nothing for leaving.
  onMemberLeftChannel(
    handler: (event: MemberLeftEvent) => Promise<void>
  ): void {
    this.memberLeftHandler = handler;
  }

  protected override processEventPayload(
    ...args: Parameters<SlackAdapter['processEventPayload']>
  ): void {
    super.processEventPayload(...args);
    const [payload, options] = args;
    const event = memberLeftSchema.safeParse(payload.event).data;
    if (
      payload.type !== 'event_callback' ||
      !event ||
      !this.memberLeftHandler
    ) {
      return;
    }
    const task = this.memberLeftHandler({
      channel: event.channel,
      userId: event.user,
    }).catch((error: unknown) =>
      this.logger.error('member_left_channel handler failed', {
        channel: event.channel,
        error,
        userId: event.user,
      })
    );
    options?.waitUntil?.(task);
  }

  private landedUnthreaded({
    raw,
    threadId,
  }: {
    raw: unknown;
    threadId: string;
  }): boolean {
    const { threadTs } = this.decodeThreadId(threadId);
    const posted = postedThreadSchema.safeParse(raw).data;
    if (!(threadTs && posted) || posted.message.thread_ts) {
      return false;
    }
    evictOldest({ cache: this.unthreaded, key: threadId });
    this.unthreaded.add(threadId);
    this.logger.warn('Slack posted a thread reply at the channel root', {
      threadId,
    });
    return true;
  }

  override async postMessage(
    ...args: Parameters<SlackAdapter['postMessage']>
  ): ReturnType<SlackAdapter['postMessage']> {
    this.assertSessionWritable(args[0]);
    const posted = await super.postMessage(...args);
    this.landedUnthreaded({ raw: posted.raw, threadId: args[0] });
    return posted;
  }

  override async editMessage(
    ...args: Parameters<SlackAdapter['editMessage']>
  ): ReturnType<SlackAdapter['editMessage']> {
    this.assertSessionWritable(args[0]);
    return await super.editMessage(...args);
  }

  override async postObject(
    ...args: Parameters<SlackAdapter['postObject']>
  ): ReturnType<SlackAdapter['postObject']> {
    this.assertSessionWritable(args[0]);
    return await super.postObject(...args);
  }

  override async editObject(
    ...args: Parameters<SlackAdapter['editObject']>
  ): ReturnType<SlackAdapter['editObject']> {
    this.assertSessionWritable(args[0]);
    return await super.editObject(...args);
  }

  async postBlocks({
    blocks,
    text,
    threadId,
  }: {
    blocks: SlackBlock[];
    text: string;
    threadId: string;
  }): Promise<void> {
    this.assertSessionWritable(threadId);
    if (this.unthreaded.has(threadId)) {
      this.logger.warn('Skipped blocks for a thread whose root is gone', {
        threadId,
      });
      return;
    }
    const { channel, threadTs } = this.decodeThreadId(threadId);
    const posted = await this._client.chat.postMessage(
      await this.withToken({ channel, thread_ts: threadTs, text, blocks })
    );
    if (posted.ts && this.landedUnthreaded({ raw: posted, threadId })) {
      await this._client.chat.delete(
        await this.withToken({ channel, ts: posted.ts })
      );
    }
  }

  private readonly userLookups = new Map<
    string,
    ReturnType<SlackAdapter['lookupUser']>
  >();
  private readonly unresolvedUntil = new Map<string, number>();
  private activeLookups = 0;
  private readonly waitingLookups: (() => void)[] = [];

  protected override lookupUser(
    ...args: Parameters<SlackAdapter['lookupUser']>
  ): ReturnType<SlackAdapter['lookupUser']> {
    const [userId] = args;
    if ((this.unresolvedUntil.get(userId) ?? 0) > Date.now()) {
      return Promise.resolve(null);
    }
    const inFlight = this.userLookups.get(userId);
    if (inFlight) {
      return inFlight;
    }

    const lookup = (async () => {
      if (this.activeLookups >= config.userLookupConcurrency) {
        await new Promise<void>((resolve) => this.waitingLookups.push(resolve));
      } else {
        this.activeLookups++;
      }
      try {
        const user = await super.lookupUser(userId);
        if (user) {
          this.unresolvedUntil.delete(userId);
        } else {
          this.unresolvedUntil.set(
            userId,
            Date.now() + config.unresolvedUserTtlMs
          );
        }
        return user;
      } finally {
        this.userLookups.delete(userId);
        const next = this.waitingLookups.shift();
        if (next) {
          next();
        } else {
          this.activeLookups--;
        }
      }
    })();

    this.userLookups.set(userId, lookup);
    return lookup;
  }

  // The base resolves `<#C123>` channel names too, so user mentions are
  // rewritten to plain text first and the rest is left to it.
  protected override async resolveInlineMentions(text: string) {
    const mentionNames = new Map<string, string>();
    const missingIds = new Set<string>();

    for (const mention of text.matchAll(mentionPattern)) {
      const [, userId, label] = mention;
      if (!userId || mentionNames.has(userId)) {
        continue;
      }
      if (label) {
        mentionNames.set(userId, label);
        continue;
      }
      missingIds.add(userId);
    }

    await Promise.all(
      [...missingIds].map(async (userId) => {
        const user = await this.lookupUser(userId);
        mentionNames.set(userId, user?.displayName ?? userId);
      })
    );

    return super.resolveInlineMentions(
      text.replace(mentionPattern, (token, userId: string) => {
        const name = mentionNames.get(userId);
        return name ? `@${name} (${userId})` : token;
      })
    );
  }
}
