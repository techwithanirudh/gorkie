import type { Message, Thread } from 'chat';
import { logger } from '../lib/logger';
import type { GorkieThreadState } from '../types';
import { attachments } from './attachments';
import { slack } from './client';
import { rawText, withoutLeadingMentions } from './message';
import { captureSearchToken } from './search-token';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

const PROCESSING_EMOJI = 'arrows_counterclockwise';
const DONE_EMOJI = 'white_check_mark';

const activeMessageIds = new Map<string, string>();

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

async function react(
  threadId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  try {
    await slack.addReaction(threadId, messageId, emoji);
  } catch (error) {
    logger.warn('[chat] failed to add reaction', { threadId, emoji, error });
  }
}

async function unreact(
  threadId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  try {
    await slack.removeReaction(threadId, messageId, emoji);
  } catch (error) {
    logger.warn('[chat] failed to remove reaction', {
      threadId,
      emoji,
      error,
    });
  }
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

  // A message arriving while the thread already has a message in flight gets
  // delivered as a signal into that active run (steered), not queued. The
  // superseded message's own promise may never cleanly resolve once steered,
  // so mark it done immediately instead of leaving it stuck processing.
  const previousId = activeMessageIds.get(thread.id);
  if (previousId && previousId !== message.id) {
    await unreact(thread.id, previousId, PROCESSING_EMOJI);
    await react(thread.id, previousId, DONE_EMOJI);
  }
  activeMessageIds.set(thread.id, message.id);
  await react(thread.id, message.id, PROCESSING_EMOJI);

  try {
    await defaultHandler(thread, attachments(message));
    await unreact(thread.id, message.id, PROCESSING_EMOJI);
    await react(thread.id, message.id, DONE_EMOJI);
  } catch (error) {
    await unreact(thread.id, message.id, PROCESSING_EMOJI);
    throw error;
  } finally {
    if (activeMessageIds.get(thread.id) === message.id) {
      activeMessageIds.delete(thread.id);
    }
  }
}

export async function onMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  await respond(thread, message, defaultHandler);
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  const state = (await thread.state) as GorkieThreadState | null;
  if (!(state?.respondOnThreadMessages === true || message.isMention)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}
