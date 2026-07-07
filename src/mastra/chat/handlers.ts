import type { Message, Thread } from 'chat';
import { z } from 'zod';
import { isUserAllowed } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { rawText, withoutLeadingMentions } from './message';
import { offerOptIn } from './onboarding';
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
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn(thread, message.author);
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
  if (await handleCommand(thread, message)) {
    return;
  }
  if (!isFollowingThread) {
    // Mastra marks a thread "subscribed" the moment it processes any message
    // in it, regardless of whether that first mention was at the thread
    // root (respondOnThreadMessages only gets set for root mentions). So a
    // one-off mid-thread mention we're NOT actively following can still
    // leave Mastra's own subscription flag true, which skips its thread
    // history backfill on every mention after the first — even though we
    // never actually saw what happened in between. Force a fresh backfill
    // for this turn by unsubscribing right before handing off; Mastra
    // re-subscribes on its own once it processes the message.
    await thread.unsubscribe().catch(() => undefined);
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
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn(thread, message.author);
    return;
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}
