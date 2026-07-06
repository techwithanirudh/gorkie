import type { ToolDisplayFn } from '@mastra/core/channels';
import { toolDisplay as config } from '../../config';
import { label } from '../../lib/label';
import { isRecord, text } from '../../lib/utils';

export type ToolDisplayEvent = Parameters<ToolDisplayFn>[0];
type FormatStyle = 'block' | 'compact';

export function codeBlock(value: string): string {
  let fence = '```';
  while (value.includes(fence)) {
    fence += '`';
  }
  return `${fence}\n${value}\n${fence}`;
}

export function format(
  value: unknown,
  max: number,
  style: FormatStyle = 'block'
): string {
  const output = (
    isRecord(value)
      ? Object.entries(value)
          .filter(
            ([, fieldValue]) => fieldValue !== undefined && fieldValue !== ''
          )
          .map(([key, fieldValue]) => {
            const formatted = text(fieldValue);
            const name = label(key);
            if (style === 'compact' || !formatted.includes('\n')) {
              return `${name}: ${formatted}`;
            }
            return `${name}:\n${formatted}`;
          })
          .join(style === 'compact' ? ', ' : '\n')
      : text(value)
  ).trim();

  if (style === 'compact') {
    return output.length > max
      ? `${output.slice(0, max).trimEnd()}...`
      : output;
  }
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

export function formatInput(
  event: ToolDisplayEvent,
  style: FormatStyle = 'block'
): string {
  const max = style === 'compact' ? config.maxSummary : config.maxDetails;
  const rendered = format(inputValue(event), max, style);
  if (rendered) {
    return rendered;
  }
  if (!('argsSummary' in event && event.argsSummary)) {
    return '';
  }
  return style === 'compact' ? event.argsSummary : codeBlock(event.argsSummary);
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
    config.maxOutput
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
