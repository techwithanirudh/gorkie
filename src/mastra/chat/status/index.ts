import { posix } from 'node:path';
import type { TypingStatusFn } from '@mastra/core/channels';
import {
  getTransformedToolPayload,
  type ToolPayloadTransformFunction,
} from '@mastra/core/tools';
import { z } from 'zod';
import { activity as config } from '../../config';
import { activitySchema } from '../../types/progress';

const transformSchema = z.looseObject({
  transform: z
    .looseObject({
      display: z
        .looseObject({
          input: z
            .custom<ToolPayloadTransformFunction>(
              (value) => typeof value === 'function'
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const status: TypingStatusFn = (chunk) => {
  const activity = activitySchema.safeParse(chunk.metadata?.gorkieActivity);
  if (
    activity.success &&
    chunk.type !== 'finish' &&
    chunk.type !== 'error' &&
    chunk.type !== 'abort'
  ) {
    // Slack caps an assistant status at 50 characters.
    return `is ${activity.data.status
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50 - 'is …'.length)}…`;
  }
  return false;
};

const labelSchema = z.object({ summary: z.string().nullable() });
const fallbackArgs = z.looseObject({
  description: z.string().optional(),
  path: z.string().optional(),
});
const repeatedAction = /^(.*) ×(\d+)$/;

function clean(text: string): string {
  return text
    .replace(/[\p{Cc}<>`*|]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, config.maxTitleChars);
}

// Tools we do not own (Mastra's workspace tools, MCP servers) carry no label,
// so they show their own description argument, title or name.
function fallbackLabel({
  args,
  title,
  toolName,
}: {
  args: unknown;
  title?: string;
  toolName: string;
}): string | null {
  const name = toolName.replace(/^agent-(?:research|explore)_/, '');
  if (name === 'ask_user') {
    return null;
  }
  const parsed = fallbackArgs.safeParse(args).data;
  if (parsed?.description) {
    return clean(parsed.description);
  }
  const readable = (title ?? name.replace(/^mastra_workspace_/, ''))
    .replace(/[_-]+/g, ' ')
    .trim();
  const target = parsed?.path ? posix.basename(parsed.path) : '';
  return clean(`${readable}${target && target !== '.' ? ` ${target}` : ''}`);
}

function labelOf(transformed: unknown): string | null | undefined {
  const parsed = labelSchema.safeParse(transformed);
  if (!parsed.success) {
    return;
  }
  return parsed.data.summary === null ? null : clean(parsed.data.summary);
}

// Mastra runs each tool's `transform.display.input` before emitting a call and
// keeps the result on the chunk.
export function chunkLabel({
  args,
  metadata,
  title,
  toolName,
}: {
  args: unknown;
  metadata?: Record<string, unknown>;
  title?: string;
  toolName: string;
}): string | null {
  const label = labelOf(
    getTransformedToolPayload(metadata, 'display', 'input-available')
      ?.transformed
  );
  return label === undefined ? fallbackLabel({ args, title, toolName }) : label;
}

// Code mode calls tools itself, so nothing has run their transform.
export async function toolLabel({
  args,
  tool,
  toolName,
}: {
  args: unknown;
  tool: unknown;
  toolName: string;
}): Promise<string | null> {
  const input = transformSchema.safeParse(tool).data?.transform?.display?.input;
  const label = input
    ? labelOf(
        await input({
          target: 'display',
          phase: 'input-available',
          toolName,
          toolCallId: '',
          input: args,
        })
      )
    : undefined;
  return label === undefined ? fallbackLabel({ args, toolName }) : label;
}

export function addAction({
  actions,
  label,
}: {
  actions: string[];
  label: string;
}): string[] {
  const last = actions.at(-1);
  const repeat = last?.match(repeatedAction);
  if ((repeat?.[1] ?? last) !== label) {
    return [...actions, label].slice(-config.maxTools);
  }
  return [...actions.slice(0, -1), `${label} ×${Number(repeat?.[2] ?? 1) + 1}`];
}
