import type { MastraStopCondition } from '../types';

// TODO(slopradar): prefer libraries + simplification: one-use helper | only agents/orchestrator.ts:166 uses it, and the AI SDK ships `hasToolCall(...names)` (Mastra bundles it in @internal/ai-v7) | use `hasToolCall('skip', 'wait')` and delete this file and MastraStopCondition; hasToolCall matches toolCalls, not toolResults, so confirm a failed skip/wait call ending the loop is fine, else inline this predicate in orchestrator.ts
export function toolCall(toolName: string): MastraStopCondition {
  return ({ steps }) =>
    steps
      .at(-1)
      ?.toolResults?.some((toolResult) => toolResult.toolName === toolName) ??
    false;
}
