import type { RequestContext } from '@mastra/core/request-context';
import type { MastraUnion } from '@mastra/core/tools';

export type MastraStopCondition = (options: {
  steps: Array<{
    finishReason?: string;
    toolCalls?: unknown[];
    toolResults?: Array<{ toolName?: string }>;
  }>;
}) => boolean;

export interface TaskToolContext {
  agent?: { resourceId?: string };
  mastra?: MastraUnion;
  requestContext?: RequestContext;
}
