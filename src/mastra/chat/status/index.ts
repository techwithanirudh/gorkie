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

  // TODO(slopradar): simplification: dead code | Mastra names subagent tools `agent-${agentName}` (@mastra/core agent-DwtTO5Px.js:37558), so rest is 'research' or 'explore' and never starts with `${id}_`: the agentId branch (L26-33) never runs and hardcodes the agent ids | delete L25-33 and keep the spawning line
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
