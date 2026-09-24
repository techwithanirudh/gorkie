import type {
  ProcessInputStepArgs,
  ProcessInputStepResult,
} from '@mastra/core/processors';
import { usage as config } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

export const outputBudget = {
  id: 'output-budget',
  name: 'Output Budget',
  description: 'Makes a turn wrap up once its output passes the per-turn cap.',
  processInputStep({
    requestContext,
    state,
    steps,
    systemMessages,
  }: ProcessInputStepArgs): ProcessInputStepResult | undefined {
    const spent = steps.reduce(
      (total, step) => total + (step.usage.outputTokens ?? 0),
      0
    );
    if (spent < config.maxOutputTokensPerTurn) {
      return;
    }
    if (!state.logged) {
      state.logged = true;
      logger.warn('[output-budget] turn reached its output cap', {
        spent,
        threadId: channelContext(requestContext).threadId,
      });
    }
    return {
      toolChoice: 'none',
      systemMessages: [
        ...systemMessages,
        {
          role: 'system',
          content:
            'This turn has used its output budget, so your tools are off. Answer now with what you have, and say plainly what is left undone so the person can ask you to continue.',
        },
      ],
    };
  },
};
