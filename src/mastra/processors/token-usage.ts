import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { addUsage } from '../db/queries/usage';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

// Cached input is left out: it is most of a long turn and costs almost nothing.
export const tokenUsage = {
  id: 'token-usage',
  name: 'Token Usage',
  description: 'Counts the tokens a run used against its requester.',
  async processOutputResult({
    messages,
    requestContext,
    result,
  }: ProcessOutputResultArgs) {
    const { userId } = channelContext(requestContext);
    const { cachedInputTokens, inputTokens, outputTokens } = result.usage;
    if (userId) {
      await addUsage({
        amount:
          Math.max(0, (inputTokens ?? 0) - (cachedInputTokens ?? 0)) +
          (outputTokens ?? 0),
        kind: 'tokens',
        userId,
      }).catch((error: unknown) => {
        logger.warn('[limits] could not count tokens', { error, userId });
      });
    }
    return messages;
  },
};
