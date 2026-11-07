import type { RequestContext } from '@mastra/core/request-context';
import type { MastraUnion } from '@mastra/core/tools';

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

export interface TaskToolContext {
  agent?: { resourceId?: string; threadId?: string };
  mastra?: MastraUnion;
  requestContext?: RequestContext;
}
