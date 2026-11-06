import { z } from 'zod';
import type { MastraStopCondition } from '../types';

const endsWithReaction = new Set([
  'leave_thread',
  'react',
  'skip',
  'status_update',
]);
const keepsTurn = z.looseObject({ continueTurn: z.literal(true) });
// Mastra reports a thrown tool as a normal result with an error output.
const failed = z.looseObject({ type: z.enum(['error-text', 'error-json']) });

// A reaction is the whole response unless the same step has a result the model
// still needs to read, or a call failed and the model has to see that.
export const reactionEndsTurn: MastraStopCondition = ({ steps }) => {
  const results = steps.at(-1)?.toolResults ?? [];
  return (
    results.some(({ toolName }) => toolName === 'react') &&
    results.every(
      ({ input, output, toolName }) =>
        toolName &&
        endsWithReaction.has(toolName) &&
        !keepsTurn.safeParse(input).success &&
        !failed.safeParse(output).success
    )
  );
};

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
