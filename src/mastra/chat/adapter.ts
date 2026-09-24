import { SlackAdapter } from '@chat-adapter/slack';
import { z } from 'zod';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

const recipientSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

type Recipient = z.infer<typeof recipientSchema>;

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
        // Persisting only lets the recipient survive a restart, so the message
        // is not held up on it, and a failed write just loses that hint.
        chat
          .getState()
          .set(this.recipientKey(threadId), recipient, 30 * 24 * 60 * 60 * 1000)
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
      if (this.activeLookups >= 4) {
        await new Promise<void>((resolve) => this.waitingLookups.push(resolve));
      } else {
        this.activeLookups++;
      }
      try {
        const user = await super.lookupUser(userId);
        if (user) {
          this.unresolvedUntil.delete(userId);
        } else {
          this.unresolvedUntil.set(userId, Date.now() + 60_000);
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
