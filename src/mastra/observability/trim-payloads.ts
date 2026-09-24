import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

const encodedMediaMinLength = 20_000;
const encodedMediaPreviewChars = 200;
const maxTrimDepth = 8;

// Base64 and data URLs carry no whitespace, while prose, code and JSON of this
// length always do, so a long unbroken string is taken for encoded media.
function isEncodedMedia(value: string): boolean {
  return value.length > encodedMediaMinLength && !/\s/.test(value);
}

// Mastra caps a string at 128 KB, and a media payload repeats in every later
// model step's input, which still adds up to tens of MB per trace.
function trim({ value, depth }: { value: unknown; depth: number }): unknown {
  if (typeof value === 'string') {
    return isEncodedMedia(value)
      ? `${value.slice(0, encodedMediaPreviewChars)}… [truncated, ${value.length} characters total]`
      : value;
  }
  if (value === null || typeof value !== 'object' || depth >= maxTrimDepth) {
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
