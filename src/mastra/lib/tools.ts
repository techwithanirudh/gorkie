import { z } from 'zod';
import type { MastraStopCondition } from '../types';

// Mastra reports a thrown tool or rejected input as a normal result, so the turn
// has to keep going for the model to see the failure and fix it.
const failedOutput = z.union([
  z.looseObject({ type: z.enum(['error-text', 'error-json']) }),
  z.looseObject({
    type: z.literal('json'),
    value: z.looseObject({ error: z.literal(true) }),
  }),
]);

// Mastra rebuilds a step's results from the turn's response messages, and
// Observational Memory can move the previous turn's last message into those, so
// its `reply` would end this turn before the model answers. Only a call made in
// this step counts.
function latestResults(steps: Parameters<MastraStopCondition>[0]['steps']) {
  const step = steps.at(-1);
  const calls = new Set(step?.toolCalls?.map(({ toolCallId }) => toolCallId));
  return (step?.toolResults ?? []).filter(({ toolCallId }) =>
    calls.has(toolCallId)
  );
}

function succeeded({ output }: { output?: unknown }): boolean {
  return !failedOutput.safeParse(output).success;
}

export function toolCall(toolName: string): MastraStopCondition {
  return ({ steps }) =>
    latestResults(steps).some(
      (result) => result.toolName === toolName && succeeded(result)
    );
}

export function stepCountIs(stepCount: number): MastraStopCondition {
  return ({ steps }) => steps.length === stepCount;
}
