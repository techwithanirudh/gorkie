import type {
  ProcessOutputResultArgs,
  ProcessOutputStreamArgs,
} from '@mastra/core/processors';
import { formatDuration, intervalToDuration } from 'date-fns';
import { slack } from '../chat/client';
import { feedbackBlock } from '../chat/feedback';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

export const turnFooter = {
  id: 'turn-footer',
  name: 'Turn Footer',
  description:
    'Closes a turn with how long it took and a thumbs rating for the response.',
  processOutputStream(args: ProcessOutputStreamArgs) {
    args.state.startTime ??= Date.now();
    if (
      args.part.type === 'tool-result' &&
      args.part.payload.toolName === 'reply' &&
      !args.part.payload.isError
    ) {
      args.state.replySent = true;
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
          feedbackBlock(traceId),
        ] as never,
        text,
      });
    } catch (error) {
      logger.warn('[turn-footer] failed to post', { threadId, error });
    }
    return args.messages;
  },
};
