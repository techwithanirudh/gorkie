import type {
  ProcessOutputResultArgs,
  ProcessOutputStreamArgs,
} from '@mastra/core/processors';
import { formatDuration, intervalToDuration } from 'date-fns';
import { slack } from '../chat/client';
import { feedbackBlock } from '../chat/feedback';
import { threadHasBackgroundTask } from '../lib/background-tasks';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

export const turnFooter = {
  id: 'turn-footer',
  name: 'Turn Footer',
  description:
    'Closes a turn with how long it took and a thumbs rating for the response.',
  processOutputStream(args: ProcessOutputStreamArgs) {
    args.state.startTime ??= Date.now();
    return args.part;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { threadId } = channelContext(args.requestContext);
    const { startTime } = args.state;

    if (
      !(threadId && args.result.text.trim()) ||
      typeof startTime !== 'number'
    ) {
      return args.messages;
    }

    // A turn that leaves a background job running isn't done: say so instead of
    // "done in X", and skip the rating (the completion wake posts its own).
    if (await threadHasBackgroundTask(threadId)) {
      try {
        await slack.postBlocks({
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: "_working in the background, I'll message you here when it's done…_",
                },
              ],
            },
          ],
          text: 'working in the background',
          threadId,
        });
      } catch (error) {
        logger.warn('[turn-footer] failed to post', { threadId, error });
      }
      return args.messages;
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
