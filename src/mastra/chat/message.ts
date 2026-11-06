import type { Message } from 'chat';
import { z } from 'zod';

const slackRawText = z.looseObject({ text: z.string() });

export function rawText(message: Message): string {
  const raw = slackRawText.safeParse(message.raw);
  return raw.success ? raw.data.text : message.text;
}

export function withoutLeadingMentions(text: string): string {
  return text.replace(/^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)+/, '');
}

export function isComment(message: Message): boolean {
  const [first] = rawText(message)
    .split('\n')
    .filter((line) => line.trim());
  return (
    first !== undefined &&
    withoutLeadingMentions(first).trimStart().startsWith('##')
  );
}

export function neutralizeBroadcasts(text: string): string {
  return text
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/gi, '@\u200B$1')
    .replace(
      /<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>/gi,
      (_match, label?: string) =>
        `@\u200B${(label ?? 'group').replace(/^@/, '')}`
    )
    .replace(/(^|[^\w\u200B])@(here|channel|everyone)\b/gi, '$1@\u200B$2');
}
