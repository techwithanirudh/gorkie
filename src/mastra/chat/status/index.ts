import {
  defaultTypingStatus,
  type TypingStatusFn,
} from '@mastra/core/channels';
import { z } from 'zod';
import { label } from '../../lib/label';
import { mcpServerNames } from '../../mcp/user-servers';
import { truncate } from './format';
import { statuses } from './statuses';

const argsSchema = z.record(z.string(), z.unknown());

const delegationAgentIds = new Set(['research', 'explore']);

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
  // Slack caps a status at 50 characters and the built-in approval text is 28
  // plus the tool name, which the longer github_ names overflow.
  if (chunk.type === 'tool-call-approval') {
    return truncate(`is asking about ${label(chunk.payload.toolName)}…`);
  }
  if (chunk.type !== 'tool-call') {
    const fallback = defaultTypingStatus(chunk, context);
    return typeof fallback === 'string' ? truncate(fallback) : fallback;
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

  if (toolName.startsWith('github_')) {
    return truncate(
      `is using github: ${label(toolName.slice('github_'.length)).toLowerCase()}…`
    );
  }

  for (const server of mcpServerNames.get(context.threadId) ?? []) {
    const prefix = `${server}_`;
    if (toolName.startsWith(prefix)) {
      return truncate(
        `is using ${server}: ${label(toolName.slice(prefix.length)).toLowerCase()}…`
      );
    }
  }

  const args = argsSchema.safeParse(chunk.payload.args).data ?? {};
  const known = statuses[toolName]?.(args);
  if (known) {
    return truncate(known);
  }

  return truncate(`is using ${label(toolName).toLowerCase()}…`);
};
