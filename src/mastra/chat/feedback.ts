import { buildFeedbackButtonsBlock } from '@chat-adapter/slack';
import type { ActionEvent, ModalCloseEvent, ModalSubmitEvent } from 'chat';
import { Modal, TextInput } from 'chat';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { getMastra } from './mastra-instance';

export const feedbackIds = {
  action: 'message_feedback',
  modal: 'message_feedback_modal',
};

const metadataSchema = z.object({
  messageId: z.string().optional(),
  threadId: z.string(),
  traceId: z.string().optional(),
});

export function feedbackBlock(
  traceId: string | undefined
): Record<string, unknown> {
  const suffix = traceId ?? '';
  return buildFeedbackButtonsBlock({
    actionId: feedbackIds.action,
    positiveValue: `up:${suffix}`,
    negativeValue: `down:${suffix}`,
  });
}

async function recordFeedback({
  comment,
  direction,
  messageId,
  threadId,
  traceId,
  userId,
}: {
  comment?: string;
  direction: 'up' | 'down';
  messageId?: string;
  threadId: string;
  traceId?: string;
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
  const direction = z.enum(['up', 'down']).safeParse(prefix).data;
  if (!direction) {
    logger.warn('[feedback] click carried no rating', {
      raw: event.raw,
      value: event.value,
    });
    return;
  }

  const rating = {
    direction,
    messageId: event.messageId,
    threadId: event.threadId,
    traceId: traceId || undefined,
    userId: event.user.userId,
  };
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
        privateMetadata: JSON.stringify(rating),
        submitLabel: 'Send',
        title: 'Bad response',
      })
    )
    .catch((error: unknown) => {
      logger.warn('[feedback] could not open the details modal', { error });
    });
  // The rating counts even when the details never arrive; a closed modal comes
  // back through onModalClose instead.
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
  const metadata = metadataSchema.safeParse(
    JSON.parse(event.privateMetadata || '{}')
  );
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
