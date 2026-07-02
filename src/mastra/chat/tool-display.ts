import type { ToolDisplayFn } from '@mastra/core/channels';

const MAX_DETAILS = 1200;
const MAX_OUTPUT = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function label(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.length === 0
    ? value
    : words
        .map(
          (word) =>
            `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
        )
        .join(' ');
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
  const id = event.toolCallId;
  const delegated = /^agent_([a-z0-9-]+)_(.+)$/.exec(event.toolName);
  const delegatedName = delegated?.[1]
    .replace(/^(research|explore|execute)-/, '')
    .replace(/-[a-z0-9]+$/, '');
  const delegateTaskName =
    event.kind === 'result' &&
    event.toolName === 'delegate_task' &&
    isRecord(event.result)
      ? [
          text(event.result.agent),
          text(event.result.name)
            .replace(/^(research|explore|execute)-/, '')
            .replace(/-[a-z0-9]+$/, ''),
        ]
          .filter(Boolean)
          .map(label)
          .join(' Agent: ')
      : undefined;
  const title = delegated
    ? `${label(delegatedName ?? delegated[1])}: ${label(delegated[2])}`
    : (delegateTaskName ?? label(event.displayName || event.toolName));

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
          ? (event.result.message ??
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
