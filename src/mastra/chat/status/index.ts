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

  if (toolName === 'skip') {
    return false;
  }

  if (toolName.startsWith('agent-')) {
    return truncate(
      `is spawning a ${label(toolName.slice('agent-'.length)).toLowerCase()} agent…`
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
