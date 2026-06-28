import type { ToolDisplayFn } from '@mastra/core/channels';

const MAX_DETAILS = 1200;
const MAX_OUTPUT = 4000;

function clip(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max).trimEnd()}...\n\n(truncated ${
    value.length - max
  } chars)`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatLabel(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return value;
  }

  return words
    .map(
      (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
    )
    .join(' ');
}

function formatPrimitive(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collapseRepeatedOutput(value: string): string {
  const trimmed = value.trim();
  const lines = trimmed.split('\n');

  if (lines.length % 2 === 0) {
    const midpoint = lines.length / 2;
    const first = lines.slice(0, midpoint).join('\n').trim();
    const second = lines.slice(midpoint).join('\n').trim();

    if (first && first === second) {
      return first;
    }
  }

  const midpoint = Math.floor(trimmed.length / 2);
  const first = trimmed.slice(0, midpoint).trim();
  const second = trimmed.slice(midpoint).trim();

  return first && first === second ? first : value;
}

function formatFields(value: unknown, max: number): string {
  if (!isRecord(value)) {
    return clip(formatPrimitive(value), max);
  }

  const lines = Object.entries(value)
    .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== '')
    .map(([key, fieldValue]) => {
      const formatted = formatPrimitive(fieldValue);
      const label = formatLabel(key);
      return formatted.includes('\n')
        ? `${label}:\n${formatted}`
        : `${label}: ${formatted}`;
    });

  return clip(lines.join('\n'), max);
}

function resultText(result: unknown): string {
  if (!isRecord(result)) {
    return clip(collapseRepeatedOutput(formatPrimitive(result)), MAX_OUTPUT);
  }

  const value =
    result.message ??
    result.output ??
    result.stdout ??
    result.stderr ??
    result.error ??
    result;

  if (typeof value === 'string') {
    return clip(collapseRepeatedOutput(value), MAX_OUTPUT);
  }

  return formatFields(value, MAX_OUTPUT);
}

export const toolDisplay: ToolDisplayFn = (event) => {
  const id = event.toolCallId;
  const title = formatLabel(event.displayName || event.toolName);

  switch (event.kind) {
    case 'running':
      return {
        kind: 'stream',
        chunk: {
          type: 'task_update',
          id,
          title,
          status: 'in_progress',
          details: formatFields(event.args, MAX_DETAILS),
        },
      };
    case 'result': {
      const failed =
        event.isError ||
        (isRecord(event.result) && event.result.success === false);
      const output = resultText(event.result);
      return {
        kind: 'stream',
        chunk: {
          type: 'task_update',
          id,
          title,
          status: failed ? 'error' : 'complete',
          output: failed && output ? `*Error*: ${output}` : output || 'Done.',
        },
      };
    }
    case 'error':
      return {
        kind: 'stream',
        chunk: {
          type: 'task_update',
          id,
          title,
          status: 'error',
          output: `*Error*: ${formatFields(event.errorText, MAX_OUTPUT)}`,
        },
      };
    default:
      return;
  }
};
