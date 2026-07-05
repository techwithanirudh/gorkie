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

const INNER_DELEGATE_CALL = /^agent-([a-z0-9-]+?)_(.+)$/;
const OUTER_DELEGATE_CALL = /^agent-([a-z0-9-]+)$/;

const activeDelegateCard = new Map<string, string>();

export function agentToolDisplay(
  event: ToolDisplayEvent
): ReturnType<ToolDisplayFn> | undefined {
  const inner = INNER_DELEGATE_CALL.exec(event.toolName);
  if (!inner) {
    return;
  }

  const [, agentName, toolName] = inner;
  const id = activeDelegateCard.get(agentName) ?? event.toolCallId;
  const stepName = label(toolName);
  const title = `${label(agentName)}: ${stepName}`;

  if (event.kind === 'running') {
    return taskUpdate({ id, status: 'in_progress', title });
  }

  if (event.kind === 'result') {
    const { failed } = formatResult(event);
    return taskUpdate({
      details: agentStepDetails({ event, failed, stepName }),
      id,
      status: 'in_progress',
      title,
    });
  }

  if (event.kind === 'error') {
    return taskUpdate({
      details: agentStepDetails({ event, failed: true, stepName }),
      id,
      status: 'in_progress',
      title,
    });
  }
}

export function agentPrompt(event: ToolDisplayEvent): string | undefined {
  const outer = OUTER_DELEGATE_CALL.exec(event.toolName);
  if (!outer) {
    return;
  }

  const [, agentName] = outer;
  if (event.kind === 'running') {
    activeDelegateCard.set(agentName, event.toolCallId);
  } else if (event.kind === 'result' || event.kind === 'error') {
    activeDelegateCard.delete(agentName);
  }

  const input = inputValue(event);
  if (isRecord(input) && typeof input.prompt === 'string') {
    return `Task:\n${codeBlock(input.prompt)}`;
  }
}

function agentStepDetails({
  event,
  failed,
  stepName,
}: {
  event: ToolDisplayEvent;
  failed: boolean;
  stepName: string;
}): string {
  const input = formatInputSummary(event);
  return `\n\n**Running:** ${stepName}${input ? ` (${input})` : ''}\n**${failed ? 'Failed' : 'Done'}**`;
}
