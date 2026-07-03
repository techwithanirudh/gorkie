import type { ToolDisplayFn } from '@mastra/core/channels';
import { label } from '../lib/label';

const MAX_DETAILS = 1200;
const MAX_OUTPUT = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function codeBlock(value: string): string {
  let fence = '```';
  while (value.includes(fence)) {
    fence += '`';
  }
  return `${fence}\n${value}\n${fence}`;
}

function format(value: unknown, max: number): string {
  const output = (
    isRecord(value)
      ? Object.entries(value)
          .filter(
            ([, fieldValue]) => fieldValue !== undefined && fieldValue !== ''
          )
          .map(([key, fieldValue]) => {
            const formatted = text(fieldValue);
            const name = label(key);
            return formatted.includes('\n')
              ? `${name}:\n${formatted}`
              : `${name}: ${formatted}`;
          })
          .join('\n')
      : text(value)
  ).trim();

  if (output.length <= max) {
    return output ? codeBlock(output) : '';
  }
  return codeBlock(
    `${output.slice(0, max).trimEnd()}...\n\n(truncated ${
      output.length - max
    } chars)`
  );
}

function taskUpdate({
  details,
  id,
  output,
  status,
  title,
}: {
  details?: string;
  id: string;
  output?: string;
  status: 'complete' | 'error' | 'in_progress';
  title: string;
}): ReturnType<ToolDisplayFn> {
  return {
    kind: 'stream',
    chunk: { type: 'task_update', id, title, status, details, output },
  };
}

export const toolDisplay: ToolDisplayFn = (event) => {
  if (event.toolName === 'skip') {
    return;
  }

  const id = event.toolCallId;
  const delegated = /^agent-([a-z0-9-]+?)_(.+)$/.exec(event.toolName);
  const title = delegated
    ? `${label(delegated[1])}: ${label(delegated[2])}`
    : label(event.displayName || event.toolName);

  switch (event.kind) {
    case 'running':
      return taskUpdate({
        id,
        title,
        status: 'in_progress',
        details: format(event.args, MAX_DETAILS),
      });
    case 'result': {
      const failed =
        event.isError ||
        (isRecord(event.result) && event.result.success === false);
      const output = format(
        isRecord(event.result)
          ? (event.result.text ??
              event.result.message ??
              event.result.output ??
              event.result.stdout ??
              event.result.stderr ??
              event.result.error ??
              event.result)
          : event.result,
        MAX_OUTPUT
      );
      return taskUpdate({
        id,
        title,
        status: failed ? 'error' : 'complete',
        output: failed && output ? `*Error*:\n${output}` : output || 'Done.',
      });
    }
    case 'error':
      return taskUpdate({
        id,
        title,
        status: 'error',
        output: `*Error*:\n${format(event.errorText, MAX_OUTPUT)}`,
      });
    default:
      return;
  }
};
