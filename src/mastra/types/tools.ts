import type { RequestContext } from '@mastra/core/request-context';
import type { MastraUnion } from '@mastra/core/tools';

export type MastraStopCondition = (options: {
  steps: Array<{
    finishReason?: string;
    toolCalls?: unknown[];
    toolResults?: Array<{
      input?: unknown;
      output?: unknown;
      toolName?: string;
    }>;
  }>;
}) => boolean;

export interface TaskToolContext {
  agent?: { resourceId?: string; threadId?: string };
  mastra?: MastraUnion;
  requestContext?: RequestContext;
}
