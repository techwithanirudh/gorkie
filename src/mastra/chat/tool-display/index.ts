import type { ToolDisplayFn } from '@mastra/core/channels';
import { label } from '../../lib/label';
import { agentPrompt, agentToolDisplay } from './agents';
import { formatError, formatInput, formatResult, taskUpdate } from './format';

export const toolDisplay: ToolDisplayFn = (event) => {
  if (event.toolName === 'skip') {
    return;
  }

  const agentUpdate = agentToolDisplay(event);
  if (agentUpdate) {
    return agentUpdate;
  }

  const id = event.toolCallId;
  const title = label(event.displayName || event.toolName);

  if (event.kind === 'running') {
    return taskUpdate({
      details: agentPrompt(event) ?? formatInput(event),
      id,
      status: 'in_progress',
      title,
    });
  }

  if (event.kind === 'result') {
    agentPrompt(event);
    const { failed, output } = formatResult(event);
    return taskUpdate({
      id,
      output: failed && output ? `*Error*:\n${output}` : output || 'Done.',
      status: failed ? 'error' : 'complete',
      title,
    });
  }

  if (event.kind === 'error') {
    agentPrompt(event);
    return taskUpdate({
      id,
      output: `*Error*:\n${formatError(event.errorText)}`,
      status: 'error',
      title,
    });
  }
};
