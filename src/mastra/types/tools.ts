export type MastraStopCondition = (options: {
  steps: Array<{
    finishReason?: string;
    toolCalls?: Array<{ toolCallId?: string }>;
    toolResults?: Array<{
      input?: unknown;
      output?: unknown;
      toolCallId?: string;
      toolName?: string;
    }>;
  }>;
}) => boolean;
