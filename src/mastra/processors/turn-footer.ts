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
      args.part.type === 'tool-call' &&
      args.part.payload.toolName !== 'skip'
    ) {
      args.state.toolCalls =
        (typeof args.state.toolCalls === 'number' ? args.state.toolCalls : 0) +
        1;
    }
    return args.part;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { threadId } = channelContext(args.requestContext);
    const { startTime } = args.state;

    // Gated on the reply text, not on whether skip ran: a turn that answered
    // and then skipped still earned its footer, and a skip-only turn has none.
    if (
      !(threadId && args.result.text.trim()) ||
      typeof startTime !== 'number'
    ) {
      return args.messages;
    }

    const elapsed = formatDuration(
      intervalToDuration({ start: startTime, end: Date.now() }),
      { format: ['hours', 'minutes', 'seconds'] }
    );
    const { toolCalls } = args.state;
    const tools =
      typeof toolCalls === 'number' && toolCalls > 0
        ? ` · ${toolCalls} ${toolCalls === 1 ? 'tool' : 'tools'}`
        : '';
    const text = `done in ${elapsed || 'under a second'}${tools}`;
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
