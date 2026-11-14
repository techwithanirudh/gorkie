import type { TypingStatusFn } from '@mastra/core/channels';
import { activitySchema } from '../../types/progress';

export const status: TypingStatusFn = (chunk) => {
  const activity = activitySchema.safeParse(chunk.metadata?.gorkieActivity);
  if (
    activity.success &&
    chunk.type !== 'finish' &&
    chunk.type !== 'error' &&
    chunk.type !== 'abort'
  ) {
    // Slack caps an assistant status at 50 characters.
    return `is ${activity.data.status
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50 - 'is …'.length)}…`;
  }
  return false;
};
