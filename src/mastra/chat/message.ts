import type { Message } from 'chat';
import { parseMarkdown } from 'chat';
import { z } from 'zod';

const slackRawText = z.looseObject({ text: z.string() });

// Slack adds the |name when the text was escaped, as slash commands with
// should_escape are.
export const userMention = /<@([UW][A-Z0-9]+)(?:\|([^>]*))?>/;

export function rawText(message: Message): string {
  const raw = slackRawText.safeParse(message.raw);
  return raw.success ? raw.data.text : message.text;
}

export function withoutLeadingMentions(text: string): string {
  return text.replace(new RegExp(`^\\s*(?:${userMention.source}\\s*)+`), '');
}

export function isComment(message: Message): boolean {
  return withoutLeadingMentions(rawText(message)).trimStart().startsWith('##');
}

export function setMessageText({
  message,
  text,
}: {
  message: Message;
  text: string;
}): void {
  message.text = text;
  message.formatted = parseMarkdown(text);
}

export function mentionsBot({
  text,
  botUserId,
}: {
  text: string;
  botUserId?: string;
}): boolean {
  return [...text.matchAll(new RegExp(userMention.source, 'g'))].some(
    (match) => match[1] === botUserId
  );
}

export function ignoredMessageReason({
  text,
  botUserId,
}: {
  text: string;
  botUserId?: string;
}): string | null {
  const first = withoutLeadingMentions(text.trimStart()).trimStart();
  if (first.startsWith('##')) {
    return 'a comment';
  }
  const direct = mentionsBot({ text, botUserId });
  if (
    !direct &&
    /<!(?:subteam\^[^>]+|(?:here|channel|everyone)(?:\|[^>]*)?)>/.test(text)
  ) {
    return 'a group mention without a direct bot mention';
  }
  if (!direct && /^(?:<>|&lt;&gt;)/.test(text.trimStart())) {
    return 'a side conversation';
  }
  return null;
}
