import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { addUsage } from '../db/queries/usage';
import { channelContext } from '../lib/context';
import { uncachedTokens } from '../lib/limits';
import { logger } from '../lib/logger';

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
    if (userId) {
      await addUsage({
        amount: uncachedTokens(result.usage),
        kind: 'tokens',
        userId,
      }).catch((error: unknown) => {
        logger.warn('[limits] could not count tokens', { error, userId });
      });
    }
    return messages;
  },
};
