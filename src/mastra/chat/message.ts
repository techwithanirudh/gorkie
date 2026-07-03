import type { Message } from 'chat';
import { z } from 'zod';

const leadingMentions = /^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)+/;

const slackRawText = z.looseObject({ text: z.string() });

export function rawText(message: Message): string {
  const raw = slackRawText.safeParse(message.raw);
  return raw.success ? raw.data.text : message.text;
}

export function withoutLeadingMentions(text: string): string {
  return text.replace(leadingMentions, '');
}
