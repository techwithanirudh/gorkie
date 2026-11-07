import type { Processor } from '@mastra/core/processors';
import { chat } from '../chat/instance';
import { agent as config } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { cutOffReplyPrompt } from '../prompts/processors';

// A step cut off at the output cap has no complete tool call, so the turn would
// end with nothing posted and nothing logged.
export const cutOffReply = {
  id: 'cut-off-reply',
  name: 'Cut Off Reply',
  description: 'Retries a step that hit the output cap, then tells the person.',
  async processOutputStep({
    abort,
    finishReason,
    messageList,
    requestContext,
    retryCount,
  }) {
    if (finishReason !== 'length') {
      return messageList;
    }
    const { threadId } = channelContext(requestContext);
    logger.warn('[cut-off-reply] step hit the output cap', {
      retryCount,
      threadId,
    });
    if (retryCount < config.maxProcessorRetries) {
      return abort(cutOffReplyPrompt, { retry: true });
    }
    if (threadId) {
      await chat()
        .thread(threadId)
        .post(
          'That answer came out too long for me to send, even after trying a shorter one. Try asking for it in smaller parts.'
        );
    }
    return messageList;
  },
} satisfies Processor<'cut-off-reply'>;
