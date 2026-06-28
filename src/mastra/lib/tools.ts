interface MastraStep {
  toolResults?: Array<{
    output?: unknown;
    toolName?: string;
  }>;
}

type MastraStopCondition = (options: { steps: MastraStep[] }) => boolean;

export function successToolCall(toolName: string): MastraStopCondition {
  return ({ steps }) =>
    steps
      .at(-1)
      ?.toolResults?.some(
        (toolResult) =>
          toolResult.toolName === toolName &&
          (toolResult.output as { success?: boolean } | undefined)?.success ===
            true
      ) ?? false;
}

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

export function stepCountAtLeast(stepCount: number): MastraStopCondition {
  return ({ steps }) => steps.length >= stepCount;
}
