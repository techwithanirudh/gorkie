import type { Mastra } from '@mastra/core/mastra';
import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { Card, CardText } from 'chat';
import { slack } from '../chat/client';
import { clip } from '../lib/clip';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

let mastraInstance: Mastra | undefined;

export const turns = {
  id: 'turns',
  __registerMastra(mastra: Mastra) {
    mastraInstance = mastra;
  },
  processOutputStep(args: ProcessOutputStepArgs) {
    const threadId = channelContext(args.requestContext).threadId;
    for (const call of args.toolCalls ?? []) {
      logger.info('[tool] call', {
        threadId,
        tool: call.toolName,
        args: clip(call.args),
      });
    }
    args.state.startTime ??= Date.now();
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

    const usage = args.result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? 0;

    logger.info('[turn] final finished', {
      threadId,
      finishReason: args.result.finishReason,
      steps: args.result.steps?.length ?? 0,
      inputTokens,
      outputTokens,
    });

    const hasTextResponse = args.result.text.trim().length > 0;
    const hasVisibleToolCall = (args.result.steps ?? []).some((step) =>
      (step.toolResults ?? []).some(({ payload }) => payload.toolName !== 'skip')
    );

    if (
      threadId &&
      ctx.platform === 'slack' &&
      (hasTextResponse || hasVisibleToolCall)
    ) {
      const parts: string[] = [];

      if (totalTokens > 0) {
        parts.push(`${totalTokens} tok`);
      }

      const startTime = args.state.startTime;
      if (typeof startTime === 'number') {
        const elapsedMs = Date.now() - startTime;
        const elapsedSec = elapsedMs / 1000;
        if (elapsedSec > 0 && outputTokens > 0) {
          const tps = (outputTokens / elapsedSec).toFixed(1);
          parts.push(`⚡ ${tps} tok/s`);
        }
      }

      const obsStore = mastraInstance?.getStorage()?.stores?.observability;
      if (obsStore) {
        try {
          const traceId = args.tracing?.currentSpan?.traceId;
          if (traceId) {
            const [inputResult, outputResult] = await Promise.all([
              obsStore.getMetricAggregate({
                name: ['mastra_model_total_input_tokens'],
                aggregation: 'sum',
                filters: { traceId },
              }),
              obsStore.getMetricAggregate({
                name: ['mastra_model_total_output_tokens'],
                aggregation: 'sum',
                filters: { traceId },
              }),
            ]);
            const inputCost = inputResult.estimatedCost ?? 0;
            const outputCost = outputResult.estimatedCost ?? 0;
            const cost = inputCost + outputCost;
            const costUnit =
              inputResult.costUnit ?? outputResult.costUnit ?? 'USD';
            if (cost > 0) {
              const costStr = cost >= 1 ? cost.toFixed(2) : cost.toFixed(5);
              parts.push(`$${costStr} ${costUnit}`);
            }
          }
        } catch (e) {
          /* cost query failed */
        }
      }

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
              ...(parts.length > 0
                ? [
                    CardText(`\n_${parts.join(' · ')}_`, {
                      style: 'muted',
                    }),
                  ]
                : []),
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
