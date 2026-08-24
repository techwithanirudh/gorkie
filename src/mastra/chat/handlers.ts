import type { Message, Thread } from 'chat';
import { z } from 'zod';
import { isUserAllowed } from '../lib/allowed-users';
import { isUserBanned } from '../lib/bans';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { rawText, withoutLeadingMentions } from './message';
import { offerOptIn } from './onboarding';
import { threadState } from './state';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

const actionTokenSchema = z.looseObject({
  action_token: z.string().min(1).optional(),
});

async function captureSearchToken({
  raw,
  thread,
}: {
  raw: unknown;
  thread: Thread;
}): Promise<void> {
  const parsed = actionTokenSchema.safeParse(raw);
  const searchToken = parsed.success ? parsed.data.action_token : undefined;
  if (searchToken) {
    await thread.setState({ searchToken });
  }
}

function isFromBot(message: Message): boolean {
  return (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  );
}

function isComment(message: Message): boolean {
  for (const line of rawText(message).split('\n')) {
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}

async function runTurn({
  defaultHandler,
  message,
  thread,
}: {
  defaultHandler: DefaultHandler;
  message: Message;
  thread: Thread;
}): Promise<void> {
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
  if (isFromBot(message)) {
    return;
  }
  if (await isUserBanned(message.author.userId)) {
    return;
  }
  await captureSearchToken({ raw: message.raw, thread });
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, thread });
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  if (isFromBot(message) || isComment(message)) {
    return;
  }
  if (await isUserBanned(message.author.userId)) {
    return;
  }
  await captureSearchToken({ raw: message.raw, thread });
  const state = await threadState(thread);
  const isFollowingThread = state?.respondOnThreadMessages === true;
  if (!(isFollowingThread || message.isMention)) {
    return;
  }
  // Onboarding was already offered on the first unauthorized mention
  // (onMention); don't repeat the card for every subsequent message in a
  // thread they still haven't opted into.
  if (!(await isUserAllowed(message.author.userId))) {
    return;
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  if (!isFollowingThread) {
    // Force history backfill for one-off mid-thread mentions that Mastra already marked subscribed.
    await thread.unsubscribe().catch(() => undefined);
  }
  await runTurn({ defaultHandler, message, thread });
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  if (isFromBot(message)) {
    return;
  }
  if (await isUserBanned(message.author.userId)) {
    return;
  }
  await captureSearchToken({ raw: message.raw, thread });
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, thread });
}
