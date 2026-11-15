import type {
  ComputeStateSignalArgs,
  Processor,
} from '@mastra/core/processors';
import { backgroundTasks, wrapUp as config } from '../config';
import { nearLimitPrompt, runLimitPrompt } from '../prompts/processors';

// A background run past its timeout is killed with nothing returned, so it is
// told to finish before then. A state signal is appended once per stage
// instead of changing the system prompt, which would void the prompt cache.
export const wrapUp = {
  id: 'wrap-up',
  stateId: 'wrap-up',
  name: 'Wrap Up',
  description:
    'Tells a background run to finish and report as it nears its timeout.',
  computeStateSignal({ state }: ComputeStateSignalArgs) {
    state.startedAt ??= Date.now();
    const left =
      backgroundTasks.timeoutMs - (Date.now() - Number(state.startedAt));
    if (left <= config.stopBeforeTimeoutMs) {
      return {
        mode: 'snapshot' as const,
        cacheKey: 'stop',
        contents: runLimitPrompt,
      };
    }
    if (left <= config.warnBeforeTimeoutMs) {
      return {
        mode: 'snapshot' as const,
        cacheKey: 'warn',
        contents: nearLimitPrompt,
      };
    }
  },
} satisfies Processor;
