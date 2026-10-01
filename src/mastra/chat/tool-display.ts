import type { ToolDisplayEvent, ToolDisplayFn } from '@mastra/core/channels';
import type { CardElement } from 'chat';
import { toolDisplay as config } from '../config';
import { statusUpdateInputSchema } from '../types';
import { label } from './status/label';

// TODO(slopradar): duplication : byte-for-byte copy of isRecord in lib/logger/index.ts:38 → export one from lib, or use `z.record(z.string(), z.unknown()).safeParse`
function isRecord(value: unknown): value is Record<string, unknown> {
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

function codeBlock(value: string): string {
  let fence = '```';
  while (value.includes(fence)) {
    fence += '`';
  }
  return `${fence}\n${value}\n${fence}`;
}

function fields({
  value,
  inline,
}: {
  value: unknown;
  inline: boolean;
}): string {
  if (!isRecord(value)) {
    return text(value).trim();
  }
  return Object.entries(value)
    .filter(([, field]) => field !== undefined && field !== '')
    .map(([key, field]) => {
      const formatted = text(field);
      return inline || !formatted.includes('\n')
        ? `${label(key)}: ${formatted}`
        : `${label(key)}:\n${formatted}`;
    })
    .join(inline ? ', ' : '\n')
    .trim();
}

function inlineFields(value: unknown): string {
  const output = fields({ value, inline: true });
  return output.length > config.maxInline
    ? `${output.slice(0, config.maxInline).trimEnd()}...`
    : output;
}

function blockFields({ value, max }: { value: unknown; max: number }): string {
  const output = fields({ value, inline: false });
  if (output.length <= max) {
    return output ? codeBlock(output) : '';
  }
  return codeBlock(
    `${output.slice(0, max).trimEnd()}...\n\n(truncated ${output.length - max} chars)`
  );
}

function resultBody(result: unknown): string {
  return blockFields({
    value: isRecord(result)
      ? (result.text ??
        result.message ??
        result.output ??
        result.stdout ??
        result.stderr ??
        result.error ??
        result)
      : result,
    max: config.maxOutput,
  });
}

function failed(event: ToolDisplayEvent): boolean {
  if (event.kind === 'error') {
    return true;
  }
  return (
    event.kind === 'result' &&
    (event.isError ||
      (isRecord(event.result) && event.result.success === false))
  );
}

function task({
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

function delegatedStep({
  agent,
  event,
  tool,
}: {
  agent: string;
  event: ToolDisplayEvent;
  tool: string;
}): ReturnType<ToolDisplayFn> {
  const name = label(tool);
  // TODO(slopradar): duplication across files : the `::` toolCallId and `<agent>_<tool>` toolName encoding is written in processors/delegated-tools.ts:30 and decoded here by string literals → export one encode/decode pair from delegated-tools.ts and use it in both places
  const separator = event.toolCallId.indexOf('::');
  const id =
    separator === -1 ? event.toolCallId : event.toolCallId.slice(0, separator);
  if (event.kind === 'running') {
    const input = inlineFields(event.args) || event.argsSummary;
    return task({
      details: `\n\n**Running:** ${name}${input ? ` (${input})` : ''}`,
      id,
      status: 'in_progress',
      title: `${label(agent)}: ${name}`,
    });
  }
  return task({
    details: `\n\n**${failed(event) ? 'Failed' : 'Done'}:** ${name}`,
    id,
    status: 'in_progress',
    title: `${label(agent)}: ${name}`,
  });
}

function runningDetails(event: ToolDisplayEvent): string {
  if (
    /^agent-[a-z0-9-]+$/.test(event.toolName) &&
    isRecord(event.args) &&
    typeof event.args.prompt === 'string'
  ) {
    return `Task:\n${codeBlock(event.args.prompt)}`;
  }
  return (
    blockFields({ value: event.args, max: config.maxDetails }) ||
    (event.argsSummary ? codeBlock(event.argsSummary) : '')
  );
}

// Undefined keeps Mastra's built-in approval card for every other tool.
export function approvalPost({
  approvals,
  event,
}: {
  approvals: Map<string, CardElement>;
  event: ToolDisplayEvent;
}): ReturnType<ToolDisplayFn> {
  const card = event.kind === 'approval' && approvals.get(event.toolCallId);
  if (!card) {
    return;
  }
  approvals.delete(event.toolCallId);
  return { kind: 'post', message: card };
}

export function detailedToolDisplay({
  approvals,
  summaries,
}: {
  approvals: Map<string, CardElement>;
  summaries: Map<string, string>;
}): ToolDisplayFn {
  return (event) => {
    if (event.kind === 'approval') {
      return approvalPost({ approvals, event });
    }
    if (event.toolName === 'skip') {
      return;
    }
    if (event.toolName === 'status_update') {
      const parsed = statusUpdateInputSchema.safeParse(event.args);
      if (event.kind !== 'running' || !parsed.success) {
        return;
      }
      const { status } = parsed.data;
      return {
        kind: 'stream',
        chunk: {
          type: 'plan_update',
          title: `${status.charAt(0).toUpperCase()}${status.slice(1)}`,
        },
      };
    }
    // TODO(slopradar): duplication : the `agent-` subagent tool-name shape is parsed three ways (here, runningDetails, status/index.ts) → one exported `parseAgentTool(toolName)` returning { agent, tool? }
    const step = /^agent-([a-z0-9-]+?)_(.+)$/.exec(event.toolName);
    if (step) {
      const [, agent, tool] = step;
      return delegatedStep({ agent, event, tool });
    }
    const id = event.toolCallId;
    const title = label(event.displayName || event.toolName);
    if (event.kind === 'running') {
      return task({
        details: runningDetails(event),
        id,
        status: 'in_progress',
        title,
      });
    }
    const summary = summaries.get(id);
    summaries.delete(id);
    // Raw errors carry API codes and internals that mean nothing in Slack;
    // the model still sees the full error.
    if (failed(event)) {
      return task({
        id,
        output: 'Oops, something went wrong.',
        status: 'error',
        title,
      });
    }
    const output = event.kind === 'result' ? resultBody(event.result) : '';
    return task({
      id,
      output: summary || output || 'Done.',
      status: 'complete',
      title,
    });
  };
}
