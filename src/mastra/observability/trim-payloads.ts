import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

// Mastra caps a string at 128 KB, and a media payload repeats in every later
// model step's input, which still adds up to tens of MB per trace.
function trim({ value, depth }: { value: unknown; depth: number }): unknown {
  if (typeof value === 'string') {
    const looksEncoded = value.length > 20_000 && !/\s/.test(value);
    if (!looksEncoded) {
      return value;
    }
    // Langfuse decodes any `data:...;base64,` run it finds, and a data URI cut
    // mid-payload fails to decode and logs an error per span, so keep only its
    // header.
    const head = value.startsWith('data:')
      ? value.slice(0, value.indexOf(',') + 1)
      : value.slice(0, 200);
    return `${head}… [truncated, ${value.length} characters total]`;
  }
  if (value === null || typeof value !== 'object' || depth >= 8) {
    return value;
  }
  if (Array.isArray(value)) {
    const next = value.map((item) => trim({ value: item, depth: depth + 1 }));
    return next.some((item, index) => item !== value[index]) ? next : value;
  }
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const trimmed = trim({ value: item, depth: depth + 1 });
    changed ||= trimmed !== item;
    next[key] = trimmed;
  }
  return changed ? next : value;
}

export const trimPayloads: SpanOutputProcessor = {
  name: 'trim-payloads',
  process(span?: AnySpan): AnySpan | undefined {
    if (!span) {
      return span;
    }
    span.input = trim({ value: span.input, depth: 0 });
    span.output = trim({ value: span.output, depth: 0 });
    return span;
  },
  shutdown() {
    return Promise.resolve();
  },
};
