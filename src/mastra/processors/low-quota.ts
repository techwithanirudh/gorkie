import type {
  ComputeStateSignalArgs,
  Processor,
} from '@mastra/core/processors';
import { channelContext } from '../lib/context';
import { usage } from '../lib/limits';
import { logger } from '../lib/logger';
import { lowQuotaPrompt, quotaClearPrompt } from '../prompts/processors';

// A state signal lands in the thread only when its cacheKey changes, so the
// note appears once per level crossed instead of on every step, and it is
// appended rather than placed in the system prompt, which keeps the cached
// prefix intact.
export const lowQuota = {
  id: 'low-quota',
  stateId: 'quota',
  name: 'Low Quota',
  description: 'Tells the model when a usage limit passes 80%, 90% or 100%.',
  async computeStateSignal({
    requestContext,
    tracking,
  }: ComputeStateSignalArgs) {
    const { userId } = channelContext(requestContext);
    if (!userId) {
      return;
    }
    const lines = (
      await usage(userId).catch((error: unknown) => {
        logger.warn('[limits] could not read usage', { error, userId });
        return [];
      })
    ).flatMap(({ max, noun, used }) => {
      const share = used / max;
      if (share >= 1) {
        return [`${noun}: used up`];
      }
      const level = [0.9, 0.8].find((mark) => share >= mark);
      return level ? [`${noun}: past ${level * 100}%`] : [];
    });
    if (lines.length > 0) {
      return {
        mode: 'snapshot' as const,
        cacheKey: lines.join('|'),
        contents: lowQuotaPrompt(lines),
      };
    }
    if (tracking?.currentCacheKey && tracking.currentCacheKey !== 'clear') {
      return {
        mode: 'snapshot' as const,
        cacheKey: 'clear',
        contents: quotaClearPrompt,
      };
    }
  },
} satisfies Processor;
