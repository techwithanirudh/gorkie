import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { channelContext } from '../lib/context';
import { logger } from '../logger';

const MAX = 500;
const clip = (value: unknown): string => {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s.length > MAX ? `${s.slice(0, MAX).trimEnd()}...` : s;
};

export const turnLog = {
  id: 'turn-log',
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
  processOutputResult(args: ProcessOutputResultArgs) {
    const threadId = channelContext(args.requestContext).threadId;
    for (const step of args.result.steps ?? []) {
      for (const { payload } of step.toolResults ?? []) {
        logger.info('[tool] result', {
          threadId,
          tool: payload.toolName,
          output: clip(payload.result),
        });
      }
    }
    logger.info('[turn] final finished', {
      threadId,
      finishReason: args.result.finishReason,
      steps: args.result.steps?.length ?? 0
    });
    return args.messages;
  },
};
