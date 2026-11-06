import type { Processor } from '@mastra/core/processors';
import { backgroundTasks, subagent as config } from '../config';
import { runLimitPrompt } from '../prompts/processors';

export const runLimits = {
  id: 'run-limits',
  name: 'Run Limits',
  description: 'Makes a subagent report what it has before a run limit hits.',
  processInputStep({ state, steps, systemMessages }) {
    state.startedAt ??= Date.now();
    const tokens = steps.reduce(
      (total, step) =>
        total + (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0),
      0
    );
    const elapsed = Date.now() - Number(state.startedAt);
    if (
      steps.length < config.maxSteps &&
      tokens < config.maxTokens &&
      elapsed < backgroundTasks.timeoutMs - config.wrapUpBeforeTimeoutMs
    ) {
      return;
    }
    return {
      toolChoice: 'none',
      systemMessages: [
        ...systemMessages,
        { role: 'system', content: runLimitPrompt },
      ],
    };
  },
} satisfies Processor<'run-limits'>;
