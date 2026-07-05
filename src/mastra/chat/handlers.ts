import type { Message, Thread } from 'chat';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { rawText, withoutLeadingMentions } from './message';
import { threadState } from './state';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

const actionToken = z.looseObject({
  action_token: z.string().min(1).optional(),
  assistant_thread: z
    .looseObject({ action_token: z.string().min(1).optional() })
    .optional(),
});

async function captureSearchToken(thread: Thread, raw: unknown): Promise<void> {
  const parsed = actionToken.safeParse(raw);
  const searchToken = parsed.success
    ? (parsed.data.action_token ?? parsed.data.assistant_thread?.action_token)
    : undefined;
  if (searchToken) {
    await thread.setState({ searchToken });
  }
}

function shouldIgnore(message: Message): boolean {
  if (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  ) {
    return true;
  }
  for (const line of rawText(message).split('\n')) {
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}

async function respond(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  logger.info('[chat] turn started', {
    threadId: thread.id,
    author: message.author.userName,
    attachments: message.attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url ?? attachment.fetchMetadata?.url,
    })),
    text: message.text,
  });

  await defaultHandler(thread, attachments(message));
}

export async function onMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  await captureSearchToken(thread, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  await captureSearchToken(thread, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  const state = await threadState(thread);
  if (!(state?.respondOnThreadMessages === true || message.isMention)) {
    return;
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  await captureSearchToken(thread, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}
