import { streamCard } from '@json-render/chat';
import type { Thread } from 'chat';
import { z } from 'zod';
import { activity as config } from '../config';
import { logger } from '../lib/logger';
import { neutralizeBroadcasts } from './message';

export const followUpActionPrefix = 'follow_up:';

const patchLine = z
  .string()
  .transform((line, ctx) => {
    try {
      return JSON.parse(line);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Not a JSON line.' });
      return z.NEVER;
    }
  })
  .pipe(
    z.looseObject({
      op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
      path: z.string(),
      value: z.unknown().optional(),
    })
  );

// Strings reach Slack through props and through $state, so every string in a
// patch is neutralized, whatever path it lands on.
function neutralized(value: unknown): unknown {
  if (typeof value === 'string') {
    return neutralizeBroadcasts(value);
  }
  if (Array.isArray(value)) {
    return value.map(neutralized);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, neutralized(entry)])
  );
}

// A click sends the label back as the person's next message, and Slack needs
// each action id in a block to differ, so the element id provides it.
function withFollowUp({ path, value }: { path: string; value: unknown }) {
  const elementId = /^\/elements\/([^/]+)$/.exec(path)?.[1];
  if (
    !elementId ||
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'Button' ||
    !('props' in value) ||
    typeof value.props !== 'object' ||
    value.props === null ||
    !('label' in value.props)
  ) {
    return value;
  }
  return {
    ...value,
    props: {
      ...value.props,
      value: value.props.label,
      id: `${followUpActionPrefix}${elementId}`,
    },
  };
}

// The answer arrives as one text stream holding prose and, inside a ```spec
// fence, JSONL patches. Prose goes to `onText` a line at a time, blank lines
// kept, which json-render's own mixed parser drops; the patches stream into a
// card message that renders as soon as its root exists.
export function answerStream({
  onText,
  thread,
}: {
  onText: (text: string) => void;
  thread: Thread;
}) {
  const patches: string[] = [];
  let ended = false;
  let wake: (() => void) | undefined;
  let card: Promise<unknown> | undefined;
  let inSpec = false;
  async function* patchLines() {
    while (!ended || patches.length > 0) {
      const next = patches.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: patches arrive in order and are yielded as they come
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }
  let buffer = '';
  const line = (text: string) => {
    const trimmed = text.trim();
    if (!inSpec && trimmed.startsWith('```spec')) {
      inSpec = true;
      return;
    }
    if (inSpec && trimmed === '```') {
      inSpec = false;
      return;
    }
    if (!inSpec) {
      onText(`${neutralizeBroadcasts(text)}\n`);
      return;
    }
    const patch = patchLine.safeParse(trimmed).data;
    if (!patch) {
      return;
    }
    const value = withFollowUp({
      path: patch.path,
      value: neutralized(patch.value),
    });
    patches.push(`${JSON.stringify({ ...patch, value })}\n`);
    card ??= streamCard(thread, patchLines(), {
      updateIntervalMs: config.editIntervalMs,
      limits: { charts: 2, tables: 1 },
    });
    wake?.();
    wake = undefined;
  };
  return {
    push(chunk: string) {
      const lines = (buffer + chunk).split('\n');
      buffer = lines.pop() ?? '';
      for (const text of lines) {
        line(text);
      }
    },
    async end() {
      if (buffer) {
        line(buffer);
      }
      ended = true;
      wake?.();
      await card?.catch((error: unknown) => {
        logger.warn('[card] the card did not render', {
          error,
          threadId: thread.id,
        });
      });
    },
  };
}
