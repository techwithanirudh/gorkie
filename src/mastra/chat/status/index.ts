import {
  defaultTypingStatus,
  type TypingStatusFn,
} from '@mastra/core/channels';
import { label } from '../../lib/label';
import { truncate } from './format';
import { toolStatus } from './statuses';

export const status: TypingStatusFn = (chunk, context) => {
  if (chunk.type === 'tool-call-approval') {
    return truncate(`is asking about ${label(chunk.payload.toolName)}…`);
  }
  if (chunk.type !== 'tool-call') {
    const fallback = defaultTypingStatus(chunk, context);
    return typeof fallback === 'string' ? truncate(fallback) : fallback;
  }

  const { toolName } = chunk.payload;

  // skip means stay quiet, so it must not flash "is using skip…" first.
  if (toolName === 'skip') {
    return false;
  }

  if (toolName.startsWith('agent-')) {
    const rest = toolName.slice('agent-'.length);
    const agentId = ['research', 'explore'].find((id) =>
      rest.startsWith(`${id}_`)
    );
    if (agentId) {
      return truncate(
        `is using ${agentId}: ${label(rest.slice(agentId.length + 1)).toLowerCase()}…`
      );
    }
    return truncate(`is spawning a ${label(rest).toLowerCase()} agent…`);
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
