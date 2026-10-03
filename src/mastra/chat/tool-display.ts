import { isRecord } from '@ai-sdk/provider-utils';
import type { ToolDisplayEvent, ToolDisplayFn } from '@mastra/core/channels';
import { toolDisplay as config } from '../config';
import {
  parentToolCallId,
  parseAgentTool,
} from '../processors/delegated-tools';
import { statusUpdateInputSchema } from '../types';
import { label } from './status/label';

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
  return codeBlock(`${output.slice(0, max).trimEnd()}...`);
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
  status: 'complete' | 'in_progress';
  title: string;
}): ReturnType<ToolDisplayFn> {
  const fit = (value: string) =>
    value.length > config.maxChunkChars
      ? `${value.slice(0, config.maxChunkChars - 3).trimEnd()}...`
      : value;
  return {
    kind: 'stream',
    chunk: {
      type: 'task_update',
      id,
      title: fit(title),
      status,
      details: details === undefined ? undefined : fit(details),
      output: output === undefined ? undefined : fit(output),
    },
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
  const id = parentToolCallId(event.toolCallId);
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
    details: `\n\n**Done:** ${name}`,
    id,
    status: 'in_progress',
    title: `${label(agent)}: ${name}`,
  });
}

function runningDetails(event: ToolDisplayEvent): string {
  if (
    parseAgentTool(event.toolName) &&
    isRecord(event.args) &&
    typeof event.args.prompt === 'string'
  ) {
    return `Task:\n${blockFields({ value: event.args.prompt, max: config.maxDetails })}`;
  }
  return (
    blockFields({ value: event.args, max: config.maxDetails }) ||
    (event.argsSummary ? codeBlock(event.argsSummary) : '')
  );
}

export function detailedToolDisplay({
  summaries,
}: {
  summaries: Map<string, string>;
}): ToolDisplayFn {
  return (event) => {
    if (event.toolName === 'skip' || event.kind === 'approval') {
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
    const agentTool = parseAgentTool(event.toolName);
    if (agentTool?.tool) {
      return delegatedStep({
        agent: agentTool.agent,
        event,
        tool: agentTool.tool,
      });
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
    // A failed call shows as a plain finished card; the model still sees the
    // full error and decides what to tell the person.
    if (failed(event)) {
      return task({ id, status: 'complete', title });
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
