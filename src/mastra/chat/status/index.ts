import {
  defaultTypingStatus,
  type TypingStatusFn,
} from '@mastra/core/channels';
import { parseAgentTool } from '../../processors/delegated-tools';
import { statusUpdateInputSchema } from '../../types';
import { fit, truncate } from './format';
import { label } from './label';
import { toolStatus } from './statuses';

// Channels calls this once per chunk and the newest string wins, so the real
// tool calls made beside a status_update in the same step would replace it.
// The status holds until the next step starts.
const statusThreads = new Set<string>();

export const status: TypingStatusFn = (chunk, context) => {
  if (
    chunk.type === 'step-start' ||
    chunk.type === 'finish' ||
    chunk.type === 'error' ||
    chunk.type === 'abort'
  ) {
    statusThreads.delete(context.threadId);
  }
  if (chunk.type === 'tool-call-approval') {
    return truncate(`is asking about ${label(chunk.payload.toolName)}…`);
  }
  if (chunk.type !== 'tool-call') {
    const fallback = defaultTypingStatus(chunk, context);
    return typeof fallback === 'string' ? truncate(fallback) : fallback;
  }

  const { toolName } = chunk.payload;

  if (toolName === 'status_update') {
    const parsed = statusUpdateInputSchema.safeParse(chunk.payload.args);
    if (!parsed.success) {
      return false;
    }
    statusThreads.add(context.threadId);
    return fit({ prefix: 'is ', content: parsed.data.status, suffix: '…' });
  }

  if (toolName === 'skip' || statusThreads.has(context.threadId)) {
    return false;
  }

  const agentTool = parseAgentTool(toolName);
  if (agentTool) {
    return truncate(
      `is spawning a ${label(agentTool.agent).toLowerCase()} agent…`
    );
  }

  if (toolName.startsWith('github_')) {
    return truncate(
      `is using github: ${label(toolName.slice('github_'.length)).toLowerCase()}…`
    );
  }

  const known = toolStatus({ args: chunk.payload.args, toolName });
  if (known) {
    return truncate(known);
  }

  return truncate(`is using ${label(toolName).toLowerCase()}…`);
};
