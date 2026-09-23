export type MastraStopCondition = (options: {
  steps: Array<{
    finishReason?: string;
    toolCalls?: unknown[];
    toolResults?: Array<{ toolName?: string }>;
  }>;
}) => boolean;
