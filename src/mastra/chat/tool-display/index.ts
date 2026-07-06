import type { ToolDisplayFn } from '@mastra/core/channels';
import { toolDisplay as config } from '../../config';
import { label } from '../../lib/label';
import { subagentDisplay, subagentPrompt } from './agents';
import { format, formatInput, formatResult, taskUpdate } from './format';

export const toolDisplay: ToolDisplayFn = (event) => {
  if (event.toolName === 'skip') {
    return;
  }

  const subagentUpdate = subagentDisplay(event);
  if (subagentUpdate) {
    return subagentUpdate;
  }

  const id = event.toolCallId;
  const title = label(event.displayName || event.toolName);

  if (event.kind === 'running') {
    return taskUpdate({
      details: subagentPrompt(event) ?? formatInput(event),
      id,
      status: 'in_progress',
      title,
    });
  }

  if (event.kind === 'result') {
    const { failed, output } = formatResult(event);
    return taskUpdate({
      id,
      output: failed && output ? `*Error*:\n${output}` : output || 'Done.',
      status: failed ? 'error' : 'complete',
      title,
    });
  }

  if (event.kind === 'error') {
    return taskUpdate({
      id,
      output: `*Error*:\n${format(event.errorText, config.maxOutput)}`,
      status: 'error',
      title,
    });
  }
};
