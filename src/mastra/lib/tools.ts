import type { MastraStopCondition } from '../types';

export function toolCall(toolName: string): MastraStopCondition {
  return ({ steps }) =>
    steps
      .at(-1)
      ?.toolResults?.some((toolResult) => toolResult.toolName === toolName) ??
    false;
}
