// TODO(slopradar): prefer libraries: hand-rolled library shape | a partial copy of the AI SDK StopCondition that Mastra's `stopWhen` accepts (LoopOptions['stopWhen'], @mastra/core dist/loop/types.d.ts:192) | delete with lib/tools.ts in favour of `hasToolCall('skip', 'wait')` (see the lib/tools.ts annotation); if a local type is still needed, derive it: `NonNullable<AgentExecutionOptions['stopWhen']>`
export type MastraStopCondition = (options: {
  steps: Array<{
    finishReason?: string;
    toolCalls?: unknown[];
    toolResults?: Array<{ toolName?: string }>;
  }>;
}) => boolean;
