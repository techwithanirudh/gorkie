import type { TypingStatusFn } from '@mastra/core/channels';
import { activitySchema } from '../../types/progress';
import { statusUpdateInputSchema } from '../../types/tools/status-update';

// Slack caps an assistant status at 50 characters.
function fit(content: string): string {
  return `is ${content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50 - 'is …'.length)}…`;
}

export const status: TypingStatusFn = (chunk, context) => {
  const activity = activitySchema.safeParse(chunk.metadata?.gorkieActivity);
  if (
    activity.success &&
    chunk.type !== 'finish' &&
    chunk.type !== 'error' &&
    chunk.type !== 'abort'
  ) {
    return fit(activity.data.status);
  }
  if (chunk.type === 'tool-call-approval') {
    return 'is waiting for your approval…';
  }
  if (
    chunk.type === 'tool-call' &&
    chunk.payload.toolName === 'status_update'
  ) {
    const parsed = statusUpdateInputSchema.safeParse(chunk.payload.args);
    return parsed.success ? fit(parsed.data.status) : false;
  }
  if (
    chunk.type === 'start' ||
    (chunk.type === 'step-start' && !context.currentStatus)
  ) {
    return 'is working…';
  }
  return false;
};
