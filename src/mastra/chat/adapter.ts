import { SlackAdapter } from '@chat-adapter/slack';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

const MAX_USER_LOOKUPS = 4;
const UNRESOLVED_TTL_MS = 60_000;

interface Recipient {
  teamId: string;
  userId: string;
}

export class SlackAgentAdapter extends SlackAdapter {
  private readonly recipients = new Map<string, Recipient>();

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
