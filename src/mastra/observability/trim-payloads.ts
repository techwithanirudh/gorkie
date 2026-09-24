import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

// A tool that returns media puts the whole base64 payload in its result, and
// every later model step carries it again in its input. Mastra already caps a
// string at 128 KB, which still adds up to tens of MB per trace. Only strings
// with no whitespace are cut: base64 and data URLs never have any, while a long
// system prompt or tool transcript always does and stays readable.
function trim({ value, depth }: { value: unknown; depth: number }): unknown {
  if (typeof value === 'string') {
    return value.length > 20_000 && !/\s/.test(value)
      ? `${value.slice(0, 200)}… [truncated, ${value.length} characters total]`
      : value;
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
