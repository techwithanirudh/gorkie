import type {
  ProcessOutputResultArgs,
  ProcessOutputStreamArgs,
} from '@mastra/core/processors';
import { formatDuration, intervalToDuration } from 'date-fns';
import { z } from 'zod';
import { slack } from '../chat/client';
import { feedbackBlock } from '../chat/feedback';
import { closeActivity } from '../chat/status';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

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
    return args.part;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { messageId, threadId } = channelContext(args.requestContext);
    // A message that joins a running turn becomes its messageId, so the run's
    // own start is the floor; the message time counts setup before the run.
    const starts: number[] = [];
    if (messageId) {
      starts.push(Number(messageId) * 1000);
    }
    if (typeof args.state.startTime === 'number') {
      starts.push(args.state.startTime);
    }
    const startTime = starts.length > 0 ? Math.min(...starts) : undefined;

    if (!threadId) {
      return args.messages;
    }
    if (args.result.finishReason === 'aborted') {
      await closeActivity(args.requestContext);
    }
    if (args.state.replySent !== true) {
      const { steps } = args.result;
      // An aborted turn already got the orchestrator's onAbort notice.
      const endedOnPurpose =
        args.result.finishReason === 'aborted' ||
        steps.some(
          (step) =>
            (step.pendingToolCalls?.length ?? 0) > 0 ||
            step.toolCalls.some(({ payload }) =>
              ['skip', 'wait', 'react'].includes(payload.toolName)
            )
        );
      if (!endedOnPurpose) {
        logger.warn('[turn-footer] turn ended without a reply', {
          threadId,
          finishReason: args.result.finishReason,
          steps: steps.length,
        });
        await slack
          .postMessage(threadId, {
            markdown:
              'Something went wrong and I stopped before answering. Mention me again to retry.',
          })
          .catch((error: unknown) =>
            logger.warn('[turn-footer] failed to post', { threadId, error })
          );
        await slack.startTyping(threadId, '');
      }
      return args.messages;
    }
    if (typeof startTime !== 'number') {
      return args.messages;
    }

    const elapsed = formatDuration(
      intervalToDuration({ start: startTime, end: Date.now() }),
      { format: ['hours', 'minutes', 'seconds'] }
    );
    const text = `done in ${elapsed || 'under a second'}`;
    const traceId = args.tracingContext?.currentSpan?.traceId;
    try {
      const { channel, threadTs } = slack.decodeThreadId(threadId);
      await slack.webClient.chat.postMessage({
        channel,
        thread_ts: threadTs || undefined,
        blocks: [
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `_${text}_` }],
          },
          // buildFeedbackButtonsBlock is typed as a plain record.
          z.looseObject({ type: z.string() }).parse(feedbackBlock(traceId)),
        ],
        text,
      });
    } catch (error) {
      logger.warn('[turn-footer] failed to post', { threadId, error });
    }
    // Mastra skips its own clear while a plan edit is in flight, and Slack
    // only clears a status on a new message, so a stale "is …" could stay.
    await slack.startTyping(threadId, '');
    return args.messages;
  },
};
