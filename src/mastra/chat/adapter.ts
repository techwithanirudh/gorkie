import { SlackAdapter } from '@chat-adapter/slack';
import type { PlanModel } from 'chat';
import { z } from 'zod';
import { activityPlanMarkerSchema } from '../types/progress';
import { withoutLeadingMentions } from './message';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

export class SlackAgentAdapter extends SlackAdapter {
  protected override handleMessageEvent(
    ...args: Parameters<SlackAdapter['handleMessageEvent']>
  ): ReturnType<SlackAdapter['handleMessageEvent']> {
    const [event] = args;
    const text = event.text ?? '';
    const mentionsBot = [...text.matchAll(mentionPattern)].some(
      ([, id]) => id === this.botUserId
    );
    // Slack escapes a typed <> in event text. Side comments go too, since a batch
    // reaches the model without the handler seeing each of its messages.
    if (
      !mentionsBot &&
      (/^\s*(?:<>|&lt;&gt;)/.test(text) ||
        (event.channel_type !== 'im' &&
          /^\s*##/.test(withoutLeadingMentions(text))))
    ) {
      return;
    }
    return super.handleMessageEvent(...args);
  }

  private readonly userLookups = new Map<
    string,
    ReturnType<SlackAdapter['lookupUser']>
  >();
  private readonly unresolvedUntil = new Map<string, number>();
  private activeLookups = 0;
  private readonly waitingLookups: (() => void)[] = [];

  protected override planToBlockKit(plan: PlanModel): unknown[] {
    if (!activityPlanMarkerSchema.safeParse(plan).success) {
      return super.planToBlockKit(plan);
    }
    return super.planToBlockKit(plan).map((block, index) => ({
      ...z.looseObject({ type: z.string() }).parse(block),
      block_id: `gorkie_plan_${index}`,
    }));
  }

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
