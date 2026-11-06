import type {
  ProcessOutputResultArgs,
  ProcessOutputStreamArgs,
} from '@mastra/core/processors';
import { formatDuration, intervalToDuration } from 'date-fns';
import { slack } from '../chat/client';
import { feedbackBlock } from '../chat/feedback';
import { richBlocks } from '../chat/rich-blocks';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { type ReplyExtras, replyExtrasMetadataSchema } from '../types/progress';

async function postRichBlocks({
  extras,
  threadId,
}: {
  extras: ReplyExtras;
  threadId: string;
}): Promise<void> {
  const { blocks, fallback } = richBlocks(extras);
  if (blocks.length === 0) {
    return;
  }
  try {
    await slack.postBlocks({ blocks, text: fallback, threadId });
  } catch (error) {
    logger.warn('[turn-footer] charts or tables were rejected', {
      error,
      threadId,
    });
    await slack
      .postBlocks({
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: fallback } }],
        text: fallback,
        threadId,
      })
      .catch((fallbackError: unknown) => {
        logger.warn('[turn-footer] table text fallback failed', {
          error: fallbackError,
          threadId,
        });
      });
  }
}

export const turnFooter = {
  id: 'turn-footer',
  name: 'Turn Footer',
  description:
    'Closes a turn with how long it took and a thumbs rating for the response.',
  processOutputStream(args: ProcessOutputStreamArgs) {
    args.state.startTime ??= Date.now();
    if (args.part.type === 'text-delta' && args.part.payload.text.trim()) {
      args.state.replySent = true;
    }
    const extras = replyExtrasMetadataSchema.safeParse(args.part.metadata);
    if (extras.success) {
      args.state.replyExtras = extras.data.gorkieReplyExtras;
    }
    return args.part;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { messageId, threadId } = channelContext(args.requestContext);
    // Counted from the person's message, since they waited for the setup too.
    const startTime = messageId
      ? Number(messageId) * 1000
      : args.state.startTime;

    if (
      !(threadId && args.state.replySent === true) ||
      typeof startTime !== 'number'
    ) {
      return args.messages;
    }

    const extras = replyExtrasMetadataSchema.shape.gorkieReplyExtras.safeParse(
      args.state.replyExtras
    );
    if (extras.success) {
      await postRichBlocks({ extras: extras.data, threadId });
    }

    const elapsed = formatDuration(
      intervalToDuration({ start: startTime, end: Date.now() }),
      { format: ['hours', 'minutes', 'seconds'] }
    );
    const text = `done in ${elapsed || 'under a second'}`;
    const traceId = args.tracingContext?.currentSpan?.traceId;
    try {
      await slack.postBlocks({
        blocks: [
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `_${text}_` }],
          },
          feedbackBlock(traceId),
        ],
        text,
        threadId,
      });
    } catch (error) {
      logger.warn('[turn-footer] failed to post', { threadId, error });
    }
    return args.messages;
  },
};
