import type { MastraStopCondition } from '../types';

export function toolCall(toolName: string): MastraStopCondition {
  return ({ steps }) =>
    steps
      .at(-1)
      ?.toolResults?.some((toolResult) => toolResult.toolName === toolName) ??
    false;
}

export function stepCountIs(stepCount: number): MastraStopCondition {
  return ({ steps }) => steps.length === stepCount;
}
