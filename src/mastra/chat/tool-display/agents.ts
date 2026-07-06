import type { ToolDisplayFn } from '@mastra/core/channels';
import { label } from '../../lib/label';
import {
  codeBlock,
  formatInputSummary,
  formatResult,
  inputValue,
  isRecord,
  type ToolDisplayEvent,
  taskUpdate,
} from './format';

export function subagentDisplay(
  event: ToolDisplayEvent
): ReturnType<ToolDisplayFn> | undefined {
  const inner = /^agent-([a-z0-9-]+?)_(.+)$/.exec(event.toolName);
  if (!inner) {
    return;
  }

  const [, agentName, toolName] = inner;
  const id = parentId(event.toolCallId) ?? event.toolCallId;
  const stepName = label(toolName);
  const title = `${label(agentName)}: ${stepName}`;

  if (event.kind === 'running') {
    const input = formatInputSummary(event);
    return taskUpdate({
      details: `\n\n**Running:** ${stepName}${input ? ` (${input})` : ''}`,
      id,
      status: 'in_progress',
      title,
    });
  }

  if (event.kind === 'result') {
    const { failed } = formatResult(event);
    return taskUpdate({
      details: `\n\n**${failed ? 'Failed' : 'Done'}:** ${stepName}`,
      id,
      status: 'in_progress',
      title,
    });
  }

  if (event.kind === 'error') {
    return taskUpdate({
      details: `\n\n**Failed:** ${stepName}`,
      id,
      status: 'in_progress',
      title,
    });
  }
}

export function subagentPrompt(event: ToolDisplayEvent): string | undefined {
  const outer = /^agent-([a-z0-9-]+)$/.exec(event.toolName);
  if (!outer) {
    return;
  }

  const input = inputValue(event);
  if (isRecord(input) && typeof input.prompt === 'string') {
    return `Task:\n${codeBlock(input.prompt)}`;
  }
}

function parentId(toolCallId: string): string | undefined {
  const separator = toolCallId.indexOf('::');
  return separator === -1 ? undefined : toolCallId.slice(0, separator);
}
