import type { Message } from 'chat';

const slackText = (raw: unknown): string | undefined => {
  if (!raw || typeof raw !== 'object' || !('text' in raw)) {
    return;
  }
  const { text } = raw as { text?: unknown };
  return typeof text === 'string' ? text : undefined;
};

export function rawMessageText(raw: unknown): string {
  return slackText(raw) ?? '';
}

export function directlyMentionsBot(text: string, botUserId?: string): boolean {
  return Boolean(
    botUserId &&
      new RegExp(`<@${escapeRegExp(botUserId)}(?:\\|[^>]+)?>`).test(text)
  );
}

export function shouldIgnoreMessage(raw: unknown, botUserId?: string): boolean {
  const text = rawMessageText(raw);
  if (text.startsWith('##')) {
    return true;
  }
  return text.startsWith('<>') && !directlyMentionsBot(text, botUserId);
}

export function isPingGroupOnly(raw: unknown, botUserId?: string): boolean {
  const text = rawMessageText(raw);
  return text.includes('<!subteam^') && !directlyMentionsBot(text, botUserId);
}

export function isStopCommand(
  raw: unknown,
  botUserName: string,
  botUserId?: string
): boolean {
  const text = rawMessageText(raw).trim();
  const escapedName = escapeRegExp(botUserName);
  const mention = botUserId
    ? `<@${escapeRegExp(botUserId)}(?:\\|[^>]+)?>`
    : `@${escapedName}`;
  return new RegExp(`^(?:${mention}|@${escapedName})\\s+!stop\\s*$`, 'i').test(
    text
  );
}

export function messageShouldBeExcluded(
  message: Message,
  botUserId?: string
): boolean {
  return (
    shouldIgnoreMessage(message.raw, botUserId) ||
    isPingGroupOnly(message.raw, botUserId)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}
