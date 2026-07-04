import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { slack } from '../chat/client';
import { clip } from '../lib/clip';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

export const turns = {
  id: 'turns',
  name: 'Turn Logging',
  processOutputStep(args: ProcessOutputStepArgs) {
    const threadId = channelContext(args.requestContext).threadId;
    for (const call of args.toolCalls ?? []) {
      logger.info('[tool] call', {
        threadId,
        tool: call.toolName,
        args: clip(call.args),
      });
    }
    return args.messages;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const ctx = channelContext(args.requestContext);
    const threadId = ctx.threadId;

    let skipped = false;
    for (const step of args.result.steps ?? []) {
      for (const { payload } of step.toolResults ?? []) {
        logger.info('[tool] result', {
          threadId,
          tool: payload.toolName,
          output: clip(payload.result),
        });
        if (payload.toolName === 'skip') {
          skipped = true;
        }
      }
    }
    logger.info('[turn] final finished', {
      threadId,
      finishReason: args.result.finishReason,
      steps: args.result.steps?.length ?? 0,
    });
    if (threadId && ctx.platform === 'slack' && !skipped) {
      await slack
        .postMessage(
          threadId,
          '_Gorkie may make mistakes. Double-check important information._'
        )
        .catch((error: unknown) =>
          logger.warn('[chat] failed to post completion footer', {
            threadId,
            error,
          })
        );
    }
    return args.messages;
  },
};
