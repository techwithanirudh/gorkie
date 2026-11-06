import type { Processor } from '@mastra/core/processors';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { getMastra } from '../chat/mastra-instance';
import { threadState } from '../chat/state';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

const signalMessage = z.object({
  content: z.looseObject({
    metadata: z.looseObject({
      signal: z.looseObject({
        attributes: z.looseObject({
          messageId: z.string().optional(),
          taskId: z.string().optional(),
        }),
      }),
    }),
  }),
});

// A message that reaches Mastra while a turn runs is queued, and Mastra starts
// it as a new run once that turn ends, including when a stop or leave_thread
// aborted it.
// Mastra reports a cancelled task as failed when it notifies the agent, and
// waking for one that was stopped on purpose would only restart the work.
async function wasCancelled(taskId: string | undefined): Promise<boolean> {
  if (!taskId) {
    return false;
  }
  const task = await getMastra()
    .backgroundTaskManager?.getTask(taskId)
    .catch((error: unknown) => {
      logger.warn('[chat] could not read a background task', { error, taskId });
    });
  return task?.status === 'cancelled';
}

export const staleMessages = {
  id: 'stale-messages',
  name: 'Stale Message Filter',
  description: 'Drops queued Slack messages sent before a stop or leave.',
  async processInput({ abort, messageList, requestContext }) {
    const { threadId } = channelContext(requestContext);
    if (!threadId) {
      return messageList;
    }
    const cutoff = (
      await threadState(chat().thread(threadId)).catch((error: unknown) => {
        logger.warn('[chat] could not read the stop cutoff', {
          error,
          threadId,
        });
        return null;
      })
    )?.dropMessagesBefore;
    const input = messageList.get.input.db();
    const stale = (
      await Promise.all(
        input.map(async (message) => {
          const attributes =
            signalMessage.safeParse(message).data?.content.metadata.signal
              .attributes;
          // Slack message ids are the message timestamp in epoch seconds.
          const sentBeforeCutoff =
            cutoff !== undefined &&
            attributes?.messageId !== undefined &&
            Number(attributes.messageId) * 1000 < cutoff;
          return sentBeforeCutoff || (await wasCancelled(attributes?.taskId))
            ? [message.id]
            : [];
        })
      )
    ).flat();
    if (stale.length === 0) {
      return messageList;
    }
    logger.info('[chat] dropped messages sent before a stop or leave', {
      count: stale.length,
      threadId,
    });
    if (stale.length === input.length) {
      // `retry` is what keeps channels from posting the reason as a
      // "Blocked by" reply; an input-phase tripwire is never retried.
      abort('Sent before a stop or leave.', { retry: true });
    }
    messageList.removeByIds(stale);
    return messageList;
  },
} satisfies Processor<'stale-messages'>;
