import { SlackAdapter } from '@chat-adapter/slack';
import type { FetchOptions, FetchResult, Message } from 'chat';
import { isPingGroupOnly, shouldIgnoreMessage } from './message-policy';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

const MAX_USER_LOOKUPS = 4;
const UNRESOLVED_TTL_MS = 60_000;

interface Recipient {
  teamId: string;
  userId: string;
}

export class SlackAgentAdapter extends SlackAdapter {
  // A scheduled run wakes an idle thread with no live message, so Chat SDK
  // can't supply the recipient_user_id/team_id that Slack's native streaming
  // needs outside a DM, and tool cards get dropped. Remember it per thread from
  // live messages so those runs reuse it. Both layers are in-process:
  // MastraStateAdapter keeps cache entries in memory, so neither survives a
  // restart, and the thread re-learns its recipient from the next live message.
  private readonly recipients = new Map<string, Recipient>();

  private shouldIgnoreRaw(raw: unknown): boolean {
    return (
      shouldIgnoreMessage(raw, this.botUserId) ||
      isPingGroupOnly(raw, this.botUserId)
    );
  }

  private recipientKey(threadId: string): string {
    return `stream-recipient:${threadId}`;
  }

  protected override handleMessageEvent(
    ...args: Parameters<SlackAdapter['handleMessageEvent']>
  ): ReturnType<SlackAdapter['handleMessageEvent']> {
    const [event] = args;
    if (this.shouldIgnoreRaw(event)) {
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
      const threadId = this.encodeThreadId({
        channel: event.channel,
        threadTs: event.thread_ts || event.ts,
      });
      const known = this.recipients.get(threadId);
      if (!(known?.userId === userId && known.teamId === teamId)) {
        const recipient: Recipient = { userId, teamId };
        if (!known && this.recipients.size >= 10_000) {
          const oldestThreadId = this.recipients.keys().next().value;
          if (oldestThreadId) {
            this.recipients.delete(oldestThreadId);
          }
        }
        this.recipients.set(threadId, recipient);
        chat
          .getState()
          .set(this.recipientKey(threadId), recipient)
          .catch(() => undefined);
      }
    }
    return super.handleMessageEvent(...args);
  }

  override async fetchMessages(
    threadId: string,
    options?: FetchOptions
  ): Promise<FetchResult<unknown>> {
    const result = await super.fetchMessages(threadId, options);
    return {
      ...result,
      messages: result.messages.filter(
        (message: Message) => !this.shouldIgnoreRaw(message.raw)
      ),
    };
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
      const stored = await chat
        .getState()
        .get<Recipient>(this.recipientKey(threadId));
      if (stored?.userId && stored.teamId) {
        recipient = stored;
        this.recipients.set(threadId, stored);
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

  async postBlocks({
    blocks,
    text,
    threadId,
  }: {
    blocks: unknown[];
    text: string;
    threadId: string;
  }): Promise<void> {
    const { channel, threadTs } = this.decodeThreadId(threadId);
    await this._client.chat.postMessage(
      await this.withToken({ channel, thread_ts: threadTs, text, blocks })
    );
  }

  // A page of messages is parsed under Promise.all and every author is looked
  // up, so without this 200 messages from five people fire 200 users.info
  // calls: the cache write lands after every concurrent read has missed.
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
      if (this.activeLookups >= MAX_USER_LOOKUPS) {
        await new Promise<void>((resolve) => this.waitingLookups.push(resolve));
      } else {
        this.activeLookups++;
      }
      try {
        const user = await super.lookupUser(userId);
        if (user) {
          this.unresolvedUntil.delete(userId);
        } else {
          this.unresolvedUntil.set(userId, Date.now() + UNRESOLVED_TTL_MS);
        }
        return user;
      } finally {
        this.userLookups.delete(userId);
        // Hand the slot over rather than freeing it, or a caller arriving in
        // between takes it and pushes past the cap.
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

  protected override async resolveInlineMentions(
    text: string,
    skipSelfMention: boolean
  ) {
    const mentionNames = new Map<string, string>();
    const missingIds = new Set<string>();
    const { botUserId } = this;

    for (const mention of text.matchAll(mentionPattern)) {
      const [, userId, label] = mention;
      if (
        !userId ||
        mentionNames.has(userId) ||
        (skipSelfMention && userId === botUserId)
      ) {
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
