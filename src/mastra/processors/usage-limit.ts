import type { Processor } from '@mastra/core/processors';
import { limits } from '../config';
import { readUsage } from '../db/queries/usage';
import { channelContext } from '../lib/context';
import { uncachedTokens } from '../lib/limits';
import { logger } from '../lib/logger';
import { usageLimitPrompt } from '../prompts/processors';

export const usageLimit = {
  id: 'usage-limit',
  name: 'Usage Limit',
  description:
    "Forces a turn to reply once its requester's token usage reaches the limit.",
  async processInputStep({ requestContext, state, steps, systemMessages }) {
    const { threadId, userId } = channelContext(requestContext);
    if (!userId) {
      return;
    }
    if (state.usedBefore === undefined) {
      const rows = await readUsage(userId).catch((error: unknown) => {
        logger.warn('[usage-limit] could not read usage', { error, userId });
        return [];
      });
      state.usedBefore = rows.find(({ kind }) => kind === 'tokens')?.used ?? 0;
    }
    const counted = steps.reduce(
      (sum, { usage }) => sum + uncachedTokens(usage),
      0
    );
    if (Number(state.usedBefore) + counted < limits.tokens.max) {
      return;
    }
    if (!state.logged) {
      state.logged = true;
      logger.warn('[usage-limit] turn wound down', {
        counted,
        threadId,
        userId,
      });
    }
    return {
      toolChoice: { type: 'tool', toolName: 'reply' },
      systemMessages: [
        ...systemMessages,
        { role: 'system', content: usageLimitPrompt },
      ],
    };
  },
} satisfies Processor<'usage-limit'>;
