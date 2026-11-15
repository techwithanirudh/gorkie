import { posix } from 'node:path';
import type { TypingStatusFn } from '@mastra/core/channels';
import type { RequestContext } from '@mastra/core/request-context';
import type { ToolPayloadTransformFunction } from '@mastra/core/tools';
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

// Slack clears an assistant status whenever a message lands in the thread, so
// the handlers re-apply the latest one while a turn is still running.
export const liveStatus = new Map<string, string>();

// The running turn's request context per Slack thread, so a stop can close its
// plan. A stop that lands in an input processor sends the channel's plan
// driver no abort chunk and skips both onAbort and processOutputResult, which
// left the plan spinning.
export const runContexts = new Map<string, RequestContext>();

const renderContext = z.looseObject({
  abortActivity: z
    .custom<() => Promise<void>>((value) => typeof value === 'function')
    .optional(),
});

export async function closeActivity(
  requestContext: RequestContext | undefined
): Promise<void> {
  await renderContext
    .safeParse(requestContext?.get('__mastra_chat_channel_render'))
    .data?.abortActivity?.();
}

// Slack caps an assistant status at 50 characters.
export function statusText(text: string): string {
  return `is ${text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50 - 'is …'.length)}…`;
}

export const status: TypingStatusFn = (chunk) => {
  const activity = activitySchema.safeParse(chunk.metadata?.gorkieActivity);
  if (
    activity.success &&
    chunk.type !== 'finish' &&
    chunk.type !== 'error' &&
    chunk.type !== 'abort'
  ) {
    return statusText(activity.data.status);
  }
  return false;
};

const labelSchema = z.object({ summary: z.string().nullable() });
const fallbackArgs = z.looseObject({
  description: z.string().optional(),
  name: z.string().optional(),
  path: z.string().optional(),
  query: z.string().optional(),
  skillName: z.string().optional(),
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
  // Mastra's workspace skill tools carry no display transform of their own.
  if (name === 'skill' && parsed?.name) {
    return clean(`using the ${parsed.name} skill`);
  }
  if (name === 'skill_read' && parsed?.skillName) {
    return clean(
      `reading the ${parsed.skillName} skill${parsed.path ? `: ${posix.basename(parsed.path)}` : ''}`
    );
  }
  if (name === 'skill_search') {
    return clean(`searching skills${parsed?.query ? `: ${parsed.query}` : ''}`);
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

// Mastra attaches a tool's display transform to a later copy of the call
// chunk than output processors and background-task streams receive (their
// `metadata` is null), so the label is computed here from the tool itself.
export async function toolLabel({
  args,
  title,
  tool,
  toolName,
}: {
  args: unknown;
  title?: string;
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
  return label === undefined ? fallbackLabel({ args, title, toolName }) : label;
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
