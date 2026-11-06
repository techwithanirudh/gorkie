import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { channelContext } from '../lib/context';
import { addTokens } from '../lib/limits';
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
      await addTokens({
        userId,
        tokens:
          Math.max(0, (inputTokens ?? 0) - (cachedInputTokens ?? 0)) +
          (outputTokens ?? 0),
      }).catch((error: unknown) => {
        logger.warn('[limits] could not count tokens', { error, userId });
      });
    }
    return messages;
  },
};
