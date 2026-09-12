import { spans } from './api';
import type { Item, Span } from './types';

const text = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
};

const demention = (value: string) =>
  value.replace(/\s*\(<?@?[UBW][A-Z0-9]{6,}>?\)/g, '');

const clip = (value: unknown, max: number): string => {
  const out = demention(text(value)).replace(/\s+/g, ' ').trim();
  return out.length > max ? `${out.slice(0, max)}…` : out;
};

function errorOf(span: Span): string {
  const out = span.output;
  if (!(out && typeof out === 'object' && 'error' in out)) {
    return '';
  }
  const raised = (out as { error: unknown }).error;
  if (raised && typeof raised === 'object' && 'message' in raised) {
    return String((raised as { message: unknown }).message);
  }
  return text(raised);
}

// A replayed turn arrives as a preamble line then one `[Name] (msg:ts): body`
// per earlier message, with the brackets Slack-escaped. All but the last are
// context, and inlining them buries the request the person actually made.
function splitContext(raw: string): {
  context: string;
  request: string;
  who: string;
} {
  const body = raw.replace(/\\([[\]])/g, '$1').trim();
  if (!body.startsWith('[Recent messages in this thread')) {
    return { context: '', request: body, who: '' };
  }
  const entries = [
    ...body.matchAll(
      /\[([^\]]+?)\]\s*\(msg:[\d.]+\):\s*([\s\S]*?)(?=\[[^\]]+?\]\s*\(msg:|$)/g
    ),
  ];
  const last = entries.at(-1);
  if (!last) {
    return { context: body, request: '(history replay only)', who: '' };
  }
  return {
    context: entries
      .slice(0, -1)
      .map((m) => `${demention(m[1])}: ${m[2].trim()}`)
      .join('\n\n'),
    request: last[2].trim(),
    who: demention(last[1]),
  };
}

export async function conversation({
  sender,
  traceId,
}: {
  sender: string;
  traceId: string;
}): Promise<Item[]> {
  const all = await spans(traceId);
  const items: Item[] = [];
  const root =
    all.find((s) => s.spanType === 'agent_run' && !s.parentSpanId) ??
    all.find((s) => s.spanType === 'agent_run');
  const agent = /agent run: '(.+)'/.exec(root?.name ?? '')?.[1] ?? 'assistant';

  const contents = (root?.input as { contents?: unknown } | undefined)
    ?.contents;
  if (contents) {
    const { context, request, who } = splitContext(demention(text(contents)));
    if (context) {
      items.push({
        collapsed: context,
        kind: 'context',
        text: `${context.split('\n\n').length} earlier messages`,
      });
    }
    items.push({
      kind: 'user',
      text: request || '(no request text)',
      who: who || sender,
    });
  }

  const ordered = all
    .filter(
      (s) => s.spanType === 'model_inference' || s.spanType === 'tool_call'
    )
    .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));

  for (const span of ordered) {
    const failure = errorOf(span);
    if (span.spanType === 'model_inference') {
      const produced = (span.output as { text?: unknown } | undefined)?.text;
      if (produced) {
        items.push({
          kind: 'assistant',
          text: demention(text(produced)),
          who: agent,
        });
      }
      if (failure) {
        items.push({ failed: true, kind: 'error', text: failure });
      }
      continue;
    }
    items.push({
      detail: failure || clip(span.output, 600),
      failed: span.attributes?.success === false || Boolean(failure),
      kind: 'tool',
      text: `${(span.name ?? '').replace(/^tool: '|'$/g, '')}(${clip(span.input, 90)})`,
    });
  }

  const final = (root?.output as { text?: unknown } | undefined)?.text;
  if (final && !items.some((i) => i.kind === 'assistant')) {
    items.push({ kind: 'assistant', text: demention(text(final)), who: agent });
  }

  const finish = ordered.at(-1)?.attributes?.finishReason;
  items.push({
    kind: 'meta',
    text: `${all.length} spans${finish ? ` · finish: ${String(finish)}` : ''}${root?.endedAt ? '' : ' · NO endedAt, run never completed'}`,
  });
  return items;
}
