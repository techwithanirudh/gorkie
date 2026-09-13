import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

// A tool that returns media puts the whole base64 payload in its result, so a
// single view_image or read_file call can push a ~13MB string onto the span and
// from there into Langfuse. Keep enough of a long value to recognise it and
// drop the rest. KEEP is well under LIMIT so re-running this is a no-op.
const LIMIT = 20_000;
const KEEP = 2000;
const MAX_DEPTH = 8;

function trim(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return value.length > LIMIT
      ? `${value.slice(0, KEEP)}… [truncated, ${value.length} characters total]`
      : value;
  }
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    const next = value.map((item) => trim(item, depth + 1));
    return next.some((item, index) => item !== value[index]) ? next : value;
  }
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const trimmed = trim(item, depth + 1);
    changed ||= trimmed !== item;
    next[key] = trimmed;
  }
  return changed ? next : value;
}

export const trimSpanPayloads: SpanOutputProcessor = {
  name: 'trim-span-payloads',
  process(span?: AnySpan): AnySpan | undefined {
    if (!span) {
      return span;
    }
    span.input = trim(span.input, 0);
    span.output = trim(span.output, 0);
    return span;
  },
  shutdown() {
    return Promise.resolve();
  },
};
