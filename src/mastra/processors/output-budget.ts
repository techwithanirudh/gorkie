import type { Processor } from '@mastra/core/processors';
import { agent as config, limits } from '../config';
import { readUsage } from '../db/queries/usage';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { outputBudgetPrompt, usageLimitPrompt } from '../prompts/processors';

// Tokens are only added to the person's usage when a run ends, so without this
// a turn started just under the limit could run far past it.
export const outputBudget = {
  id: 'output-budget',
  name: 'Output Budget',
  description:
    "Makes a turn wrap up once its output passes the per-turn cap or its requester's usage reaches the limit.",
  async processInputStep({ requestContext, state, steps, systemMessages }) {
    const { threadId, userId } = channelContext(requestContext);
    if (userId && state.usedBefore === undefined) {
      state.usedBefore =
        (await readUsage(userId)).find(({ kind }) => kind === 'tokens')?.used ??
        0;
    }
    let output = 0;
    let counted = 0;
    for (const { usage } of steps) {
      output += usage.outputTokens ?? 0;
      // Counted the way processors/token-usage.ts adds it to the limit.
      counted +=
        Math.max(0, (usage.inputTokens ?? 0) - (usage.cachedInputTokens ?? 0)) +
        (usage.outputTokens ?? 0);
    }
    const overLimit =
      userId !== undefined &&
      Number(state.usedBefore) + counted >= limits.tokens.max;
    if (output < config.maxOutputTokensPerTurn && !overLimit) {
      return;
    }
    if (!state.logged) {
      state.logged = true;
      logger.warn('[output-budget] turn wound down', {
        counted,
        output,
        reason: overLimit ? 'usage limit' : 'output cap',
        threadId,
      });
    }
    return {
      toolChoice: { type: 'tool', toolName: 'reply' },
      systemMessages: [
        ...systemMessages,
        {
          role: 'system',
          content: overLimit ? usageLimitPrompt : outputBudgetPrompt,
        },
      ],
    };
  },
} satisfies Processor<'output-budget'>;
