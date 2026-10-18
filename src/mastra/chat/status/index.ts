import type { TypingStatusFn } from '@mastra/core/channels';
import { statusUpdateInputSchema } from '../../types';
import { activitySchema } from '../../types/progress';
import { fit } from './format';

export const status: TypingStatusFn = (chunk, context) => {
  const activity = activitySchema.safeParse(chunk.metadata?.gorkieActivity);
  if (
    activity.success &&
    chunk.type !== 'finish' &&
    chunk.type !== 'error' &&
    chunk.type !== 'abort'
  ) {
    return fit({ prefix: 'is ', content: activity.data.status, suffix: '…' });
  }
  if (chunk.type === 'tool-call-approval') {
    return 'is waiting for your approval…';
  }
  if (
    chunk.type === 'tool-call' &&
    chunk.payload.toolName === 'status_update'
  ) {
    const parsed = statusUpdateInputSchema.safeParse(chunk.payload.args);
    return parsed.success
      ? fit({ prefix: 'is ', content: parsed.data.status, suffix: '…' })
      : false;
  }
  if (
    chunk.type === 'start' ||
    (chunk.type === 'step-start' && !context.currentStatus)
  ) {
    return 'is working…';
  }
  return false;
};
