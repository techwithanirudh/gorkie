import { z } from 'zod';
import type { MastraStopCondition } from '../types';

const endsWithReaction = new Set([
  'leave_thread',
  'react',
  'skip',
  'status_update',
]);
const keepsTurn = z.looseObject({ continueTurn: z.literal(true) });
// Mastra reports a thrown tool or rejected input as a normal result, so the turn
// has to keep going for the model to see the failure and fix it.
const failedOutput = z.union([
  z.looseObject({ type: z.enum(['error-text', 'error-json']) }),
  z.looseObject({
    type: z.literal('json'),
    value: z.looseObject({ error: z.literal(true) }),
  }),
]);

function succeeded({ output }: { output?: unknown }): boolean {
  return !failedOutput.safeParse(output).success;
}

// A reaction is the whole response unless the same step has a result the model
// still needs to read, or a call failed and the model has to see that.
export const reactionEndsTurn: MastraStopCondition = ({ steps }) => {
  const results = steps.at(-1)?.toolResults ?? [];
  return (
    results.some(({ toolName }) => toolName === 'react') &&
    results.every(
      (result) =>
        result.toolName &&
        endsWithReaction.has(result.toolName) &&
        !keepsTurn.safeParse(result.input).success &&
        succeeded(result)
    )
  );
};

export function toolCall(toolName: string): MastraStopCondition {
  return ({ steps }) =>
    steps
      .at(-1)
      ?.toolResults?.some(
        (result) => result.toolName === toolName && succeeded(result)
      ) ?? false;
}

export function stepCountIs(stepCount: number): MastraStopCondition {
  return ({ steps }) => steps.length === stepCount;
}
