import { SlackAdapter } from '@chat-adapter/slack';
import { z } from 'zod';
import { slack as config } from '../config';
import type { MemberLeftEvent } from '../types';

// TODO(slopradar): CODING_STANDARDS: one canonical pattern | third Slack user-mention regex in chat/, each accepting different ids: this `[A-Z0-9_]+`, message.ts userMention `[UW][A-Z0-9]+`, message.ts withoutLeadingMentions `[A-Z0-9][A-Z0-9._-]*` | export one mention pattern from message.ts and derive the global and leading-anchored variants from its source
const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

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

export class SlackAgentAdapter extends SlackAdapter {
  private readonly recipients = new Map<string, Recipient>();

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
    const [event] = args;
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
      const threadId = this.encodeThreadId({
        channel: event.channel,
        threadTs: event.thread_ts || event.ts,
      });
      const known = this.recipients.get(threadId);
      if (!(known?.userId === userId && known.teamId === teamId)) {
        const recipient: Recipient = { userId, teamId };
        // TODO(slopradar): simplification: duplicated logic | the evict-oldest-when-full bound is hand-written twice, here for recipients and again in landedUnthreaded (L153-161) | one bounded-insert helper for both caches
        if (!known && this.recipients.size >= config.maxCachedThreads) {
          const oldestThreadId = this.recipients.keys().next().value;
          if (oldestThreadId) {
            this.recipients.delete(oldestThreadId);
          }
        }
        this.recipients.set(threadId, recipient);
        // TODO(slopradar): CODING_STANDARDS: no swallowed catch | `.catch(() => undefined)` drops a failed recipient write silently, and that write is what lets stream() stay native after a restart | log at debug/warn with threadId, as names.ts does for its cache write
        chat
          .getState()
          .set(this.recipientKey(threadId), recipient, config.recipientTtlMs)
          .catch(() => undefined);
      }
    }
    return super.handleMessageEvent(...args);
  }

  override async stream(
    ...args: Parameters<SlackAdapter['stream']>
  ): ReturnType<SlackAdapter['stream']> {
    const [threadId, textStream, options] = args;
    const { channel } = this.decodeThreadId(threadId);
    const { chat } = this;
    if (
      channel.startsWith('D') ||
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
    if (
      !this.unthreaded.has(threadId) &&
      this.unthreaded.size >= config.maxCachedThreads
    ) {
      const oldest = this.unthreaded.values().next().value;
      if (oldest) {
        this.unthreaded.delete(oldest);
      }
    }
    this.unthreaded.add(threadId);
    this.logger.warn('Slack posted a thread reply at the channel root', {
      threadId,
    });
    return true;
  }

  override async postMessage(
    ...args: Parameters<SlackAdapter['postMessage']>
  ): ReturnType<SlackAdapter['postMessage']> {
    const posted = await super.postMessage(...args);
    this.landedUnthreaded({ raw: posted.raw, threadId: args[0] });
    return posted;
  }

  async postBlocks({
    blocks,
    text,
    threadId,
  }: {
    blocks: unknown[];
    text: string;
    threadId: string;
  }): Promise<void> {
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

  // TODO(slopradar): review: correctness | this override replaces the base wholesale; @chat-adapter/slack 4.41 base also resolves `<#C123>` channel mentions (collectMentionIds + lookupMentionNames, dist/index.js:3667), so channel ids now reach the model unnamed | keep the `@name (U123)` user rewrite, then `return super.resolveInlineMentions(rewritten)` so the base still names channels
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

    if (mentionNames.size === 0) {
      return text;
    }

    return text.replace(mentionPattern, (token, userId: string) => {
      const name = mentionNames.get(userId);
      return name ? `@${name} (${userId})` : token;
    });
  }
}
