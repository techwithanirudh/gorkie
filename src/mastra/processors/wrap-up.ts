import type { Processor } from '@mastra/core/processors';
import { limits } from '../config';
import { readUsage } from '../db/queries/usage';
import { channelContext } from '../lib/context';
import { uncachedTokens } from '../lib/limits';
import { logger } from '../lib/logger';
import { runLimitPrompt, usageLimitPrompt } from '../prompts/processors';

// Usage is only added to the person's total when a run ends, so a run that
// starts under any of these limits has to be stopped from inside.
export function wrapUp({
  deadlineMs,
  id,
  maxSteps,
  maxTokens,
}: {
  deadlineMs?: number;
  id: string;
  maxSteps: number;
  maxTokens: number;
}) {
  return {
    id,
    name: 'Wrap Up',
    description:
      "Turns tools off and asks for a final answer once a run reaches its step, token or time cap, or its requester's usage limit.",
    async processInputStep({ requestContext, state, steps, systemMessages }) {
      const { threadId, userId } = channelContext(requestContext);
      state.startedAt ??= Date.now();
      if (userId && state.usedBefore === undefined) {
        const rows = await readUsage(userId).catch((error: unknown) => {
          logger.warn('[wrap-up] could not read usage', { error, userId });
          return [];
        });
        state.usedBefore =
          rows.find(({ kind }) => kind === 'tokens')?.used ?? 0;
      }
      const tokens = steps.reduce(
        (sum, { usage }) => sum + uncachedTokens(usage),
        0
      );
      const overQuota =
        userId !== undefined &&
        Number(state.usedBefore) + tokens >= limits.tokens.max;
      const overRun =
        steps.length >= maxSteps ||
        tokens >= maxTokens ||
        (deadlineMs !== undefined &&
          Date.now() - Number(state.startedAt) >= deadlineMs);
      if (!(overQuota || overRun)) {
        return;
      }
      if (!state.logged) {
        state.logged = true;
        logger.warn('[wrap-up] run wound down', {
          agent: id,
          reason: overQuota ? 'usage limit' : 'run limit',
          steps: steps.length,
          threadId,
          tokens,
        });
      }
      return {
        toolChoice: 'none',
        systemMessages: [
          ...systemMessages,
          {
            role: 'system',
            content: overQuota ? usageLimitPrompt : runLimitPrompt,
          },
        ],
      };
    },
  } satisfies Processor;
}
