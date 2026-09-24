import { buildFeedbackButtonsBlock } from '@chat-adapter/slack';
import type { ActionEvent, ModalCloseEvent, ModalSubmitEvent } from 'chat';
import { Modal, TextInput } from 'chat';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { storedJson } from '../types';
import { optInStatus } from './allowed-users';
import { getMastra } from './mastra-instance';
import { banStatus } from './moderation';

export const feedbackIds = {
  action: 'message_feedback',
  modal: 'message_feedback_modal',
};

const directionSchema = z.enum(['up', 'down']);

const metadataSchema = z.object({
  messageId: z.string().optional(),
  threadId: z.string(),
  traceId: z.string().optional(),
});

export function feedbackBlock(traceId: string): Record<string, unknown> {
  return buildFeedbackButtonsBlock({
    actionId: feedbackIds.action,
    positiveValue: `up:${traceId}`,
    negativeValue: `down:${traceId}`,
  });
}

async function recordFeedback({
  comment,
  direction,
  messageId,
  threadId,
  traceId,
  userId,
}: z.infer<typeof metadataSchema> & {
  comment?: string;
  direction: z.infer<typeof directionSchema>;
  userId: string;
}): Promise<void> {
  const { observability } = getMastra();
  if (!observability.addFeedback) {
    logger.warn('[feedback] observability cannot record feedback');
    return;
  }

  await observability.addFeedback({
    correlationContext: { traceId },
    feedback: {
      comment,
      feedbackSource: 'user',
      feedbackType: 'thumbs',
      feedbackUserId: userId,
      metadata: { messageId, threadId },
      value: direction === 'up' ? 1 : -1,
    },
  });
  logger.info('[feedback] recorded', { direction, threadId, traceId, userId });
}

export async function onFeedbackClick(event: ActionEvent): Promise<void> {
  const [prefix, traceId] = (event.value ?? '').split(':');
  const direction = directionSchema.safeParse(prefix).data;
  if (!direction) {
    logger.warn('[feedback] click carried no rating', {
      raw: event.raw,
      value: event.value,
    });
    return;
  }

  if (!traceId) {
    logger.warn('[feedback] rating has no trace to attach to', {
      direction,
      messageId: event.messageId,
      threadId: event.threadId,
      userId: event.user.userId,
    });
    return;
  }
  if (
    (await banStatus(event.user.userId)).status === 'banned' ||
    (await optInStatus(event.user.userId)) !== 'allowed'
  ) {
    logger.info('[feedback] ignored a rating from a blocked user', {
      threadId: event.threadId,
      userId: event.user.userId,
    });
    return;
  }

  const metadata = {
    messageId: event.messageId,
    threadId: event.threadId,
    traceId,
  };
  const rating = { ...metadata, direction, userId: event.user.userId };
  if (direction === 'up') {
    await recordFeedback(rating);
    return;
  }

  const opened = await event
    .openModal(
      Modal({
        callbackId: feedbackIds.modal,
        children: [
          TextInput({
            id: 'details',
            label: 'What went wrong?',
            maxLength: 2000,
            multiline: true,
            placeholder: 'What did you expect instead?',
          }),
        ],
        notifyOnClose: true,
        privateMetadata: JSON.stringify(metadata),
        submitLabel: 'Send',
        title: 'Bad response',
      })
    )
    .catch((error: unknown) => {
      logger.warn('[feedback] could not open the details modal', { error });
    });
  if (!opened) {
    await recordFeedback(rating);
  }
}

export async function recordFeedbackDetails({
  comment,
  event,
}: {
  comment?: string;
  event: ModalCloseEvent | ModalSubmitEvent;
}): Promise<void> {
  const metadata = storedJson
    .pipe(metadataSchema)
    .safeParse(event.privateMetadata);
  if (!metadata.success) {
    logger.warn('[feedback] modal carried no thread to attribute it to');
    return;
  }
  await recordFeedback({
    ...metadata.data,
    comment: comment?.trim() || undefined,
    direction: 'down',
    userId: event.user.userId,
  });
}
