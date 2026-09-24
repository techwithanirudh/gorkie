import type { Message } from 'chat';
import { z } from 'zod';

const slackRawText = z.looseObject({ text: z.string() });

// Slack adds the |name when the text was escaped, as slash commands with
// should_escape are.
export const userMention = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/;

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
