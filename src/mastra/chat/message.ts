import type { Message } from 'chat';

const leadingMentions = /^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)+/;

function rawSlackText(message: Message): string | undefined {
  const raw = message.raw;
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('text' in raw) ||
    typeof (raw as { text: unknown }).text !== 'string'
  ) {
    return;
  }
  return (raw as { text: string }).text;
}

export function rawText(message: Message): string {
  return rawSlackText(message) ?? message.text;
}

export function withoutLeadingMentions(text: string): string {
  return text.replace(leadingMentions, '');
}
