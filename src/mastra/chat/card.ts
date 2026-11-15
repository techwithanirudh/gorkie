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

const button = z.looseObject({
  type: z.literal('Button'),
  props: z.looseObject({ label: z.string() }),
});

const linkButton = z.looseObject({
  type: z.literal('LinkButton'),
  props: z.looseObject({ url: z.string() }),
});

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

// Not json-render's createMixedStreamParser, which drops blank prose lines.
export function answerStream({
  onText,
  thread,
}: {
  onText: (text: string) => void;
  thread: Thread;
}) {
  let patches: ReadableStreamDefaultController<string> | undefined;
  const lines = new ReadableStream<string>({
    start(controller) {
      patches = controller;
    },
  });
  let card: Promise<unknown> | undefined;
  let inSpec = false;
  let blankLines = '';
  let buffer = '';
  const linkCounts = new Map<string, number>();

  const element = ({ path, value }: { path: string; value: unknown }) => {
    // A click sends the label back as the person's next message, and Slack
    // needs each action id in a block to differ, so the element id provides it.
    const elementId = /^\/elements\/([^/]+)$/.exec(path)?.[1];
    const clickable = button.safeParse(value).data;
    if (elementId && clickable) {
      return {
        ...clickable,
        props: {
          ...clickable.props,
          value: clickable.props.label,
          id: `${followUpActionPrefix}${elementId}`,
        },
      };
    }
    // json-render passes no id for a LinkButton, so Slack's action id is
    // `link-<url>` and a repeated URL fails the whole card with invalid_blocks.
    const link = linkButton.safeParse(value).data;
    if (!link) {
      return value;
    }
    const { url } = link.props;
    const seen = linkCounts.get(url) ?? 0;
    linkCounts.set(url, seen + 1);
    if (seen === 0) {
      return value;
    }
    const suffix = `${url.includes('#') ? '' : '#'}${'_'.repeat(seen)}`;
    return { ...link, props: { ...link.props, url: `${url}${suffix}` } };
  };

  const line = (text: string) => {
    const trimmed = text.trim();
    if (inSpec ? trimmed === '```' : trimmed.startsWith('```spec')) {
      inSpec = !inSpec;
      return;
    }
    if (!inSpec) {
      if (!trimmed) {
        blankLines += '\n';
        return;
      }
      onText(`${blankLines}${neutralizeBroadcasts(text)}\n`);
      blankLines = '';
      return;
    }
    const patch = patchLine.safeParse(trimmed).data;
    if (!patch) {
      return;
    }
    const value = element({
      path: patch.path,
      value: neutralized(patch.value),
    });
    patches?.enqueue(`${JSON.stringify({ ...patch, value })}\n`);
    card ??= streamCard(thread, lines, {
      updateIntervalMs: config.editIntervalMs,
      limits: { charts: 2, tables: 1 },
    });
  };

  return {
    push(chunk: string) {
      const complete = (buffer + chunk).split('\n');
      buffer = complete.pop() ?? '';
      for (const text of complete) {
        line(text);
      }
    },
    async end() {
      if (buffer) {
        line(buffer);
      }
      patches?.close();
      await card?.catch((error: unknown) => {
        logger.warn('[card] the card did not render', {
          error,
          threadId: thread.id,
        });
      });
    },
  };
}
