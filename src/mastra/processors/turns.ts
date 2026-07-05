import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { Card, CardText } from 'chat';
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

    for (const step of args.result.steps ?? []) {
      for (const { payload } of step.toolResults ?? []) {
        if (payload.isError) {
          logger.warn('[tool] error', {
            threadId,
            tool: payload.toolName,
            error: clip(payload.result),
          });
        } else {
          logger.info('[tool] result', {
            threadId,
            tool: payload.toolName,
            output: clip(payload.result),
          });
        }
      }
    }
    logger.info('[turn] final finished', {
      threadId,
      finishReason: args.result.finishReason,
      steps: args.result.steps?.length ?? 0,
    });

    const hasTextResponse = args.result.text.trim().length > 0;
    const hasToolCall = (args.result.steps ?? []).some(
      (step) => (step.toolResults ?? []).length > 0
    );
    if (
      threadId &&
      ctx.platform === 'slack' &&
      (hasTextResponse || hasToolCall)
    ) {
      await slack
        .postMessage(
          threadId,
          Card({
            children: [
              CardText(
                'gorkie may make mistakes. double-check important information.',
                {
                  style: 'muted',
                }
              ),
            ],
          })
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
