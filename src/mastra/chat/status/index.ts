import {
  defaultTypingStatus,
  type TypingStatusFn,
} from '@mastra/core/channels';
import { z } from 'zod';
import { label } from '../../lib/label';
import { truncate } from './format';
import { statuses } from './statuses';

const argsSchema = z.record(z.string(), z.unknown());

const delegationAgentIds = new Set(['research', 'explore']);

// A spawned sub-agent's own tool calls arrive namespaced as
// `agent-<id>_<childToolName>`, so matching on the `agent-` prefix alone
// would render them identically to the spawn call itself.
function delegatedChildTool(
  rest: string
): { agentId: string; childToolName: string } | undefined {
  for (const agentId of delegationAgentIds) {
    const prefix = `${agentId}_`;
    if (rest.startsWith(prefix)) {
      return { agentId, childToolName: rest.slice(prefix.length) };
    }
  }
}

export const status: TypingStatusFn = (chunk, context) => {
  if (chunk.type !== 'tool-call') {
    return defaultTypingStatus(chunk, context);
  }

  const { toolName } = chunk.payload;

  if (toolName.startsWith('agent-')) {
    const rest = toolName.slice(6);
    const delegated = delegatedChildTool(rest);
    if (delegated) {
      return truncate(
        `is using ${delegated.agentId}: ${label(delegated.childToolName).toLowerCase()}…`
      );
    }
    return truncate(`is spawning a ${label(rest).toLowerCase()} agent…`);
  }

  const args = argsSchema.safeParse(chunk.payload.args).data ?? {};
  const known = statuses[toolName]?.(args);
  if (known) {
    return truncate(known);
  }

  return truncate(`is using ${label(toolName).toLowerCase()}…`);
};
