import type { ToolDisplayFn } from '@mastra/core/channels';
import { label } from '../../lib/label';

const MAX_DETAILS = 1200;
const MAX_OUTPUT = 4000;

export type ToolDisplayEvent = Parameters<ToolDisplayFn>[0];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (value === null || value === undefined) {
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

export function codeBlock(value: string): string {
  let fence = '```';
  while (value.includes(fence)) {
    fence += '`';
  }
  return `${fence}\n${value}\n${fence}`;
}

function compact(value: unknown): string {
  const summary = isRecord(value)
    ? Object.entries(value)
        .filter(
          ([, fieldValue]) => fieldValue !== undefined && fieldValue !== ''
        )
        .map(([key, fieldValue]) => `${label(key)}: ${text(fieldValue)}`)
        .join(', ')
    : text(value);
  return summary.length > 200
    ? `${summary.slice(0, 200).trimEnd()}...`
    : summary;
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
    `${output.slice(0, max).trimEnd()}...\n\n(truncated ${output.length - max} chars)`
  );
}

export function inputValue(event: ToolDisplayEvent): unknown {
  if ('args' in event && event.args !== undefined) {
    return event.args;
  }
  const rawEvent: unknown = event;
  if (isRecord(rawEvent)) {
    return rawEvent.input ?? rawEvent.params;
  }
}

export function formatInput(event: ToolDisplayEvent): string {
  const input = format(inputValue(event), MAX_DETAILS);
  if (input) {
    return input;
  }
  return 'argsSummary' in event && event.argsSummary
    ? codeBlock(event.argsSummary)
    : '';
}

export function formatInputSummary(event: ToolDisplayEvent): string {
  const input = compact(inputValue(event));
  if (input) {
    return input;
  }
  return 'argsSummary' in event && event.argsSummary
    ? String(event.argsSummary)
    : '';
}

export function formatError(errorText: unknown): string {
  return format(errorText, MAX_OUTPUT);
}

export function formatResult(event: ToolDisplayEvent): {
  failed: boolean;
  output: string;
} {
  const result = 'result' in event ? event.result : undefined;
  const failed =
    ('isError' in event && event.isError) ||
    (isRecord(result) && result.success === false);
  const output = format(
    isRecord(result)
      ? (result.text ??
          result.message ??
          result.output ??
          result.stdout ??
          result.stderr ??
          result.error ??
          result)
      : result,
    MAX_OUTPUT
  );
  return { failed: !!failed, output };
}

export function taskUpdate({
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
    chunk: { details, id, output, status, title, type: 'task_update' },
    kind: 'stream',
  };
}
