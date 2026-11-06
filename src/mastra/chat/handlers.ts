import type { ChannelHandlerContext } from '@mastra/core/channels';
import type { Message, Thread } from 'chat';
import { isUserAllowed } from '../lib/allowed-users';
import { overLimit } from '../lib/limits';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { shouldRespond } from './gate';
import { withHistory } from './history';
import { isComment } from './message';
import { offerOptIn } from './onboarding';
import { threadState } from './state';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

function isFromBot(message: Message): boolean {
  return (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  );
}

async function runCommands({
  message,
  skipped,
  thread,
}: {
  message: Message;
  skipped: readonly Message[];
  thread: Thread;
}): Promise<boolean> {
  await Promise.all(
    skipped.map((earlier) => handleCommand({ message: earlier, thread }))
  );
  return handleCommand({ message, thread });
}

async function runTurn({
  defaultHandler,
  message,
  skipped,
  thread,
}: {
  defaultHandler: DefaultHandler;
  message: Message;
  skipped: readonly Message[];
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

  await defaultHandler(
    thread,
    await withHistory({ message: attachments(message), skipped, thread })
  );
  // Only a turn that finished has seen the backfill; a failed one retries it.
  if (!thread.isDM) {
    await thread.setState({ lastSeenMessage: message.id });
  }
}

// Channels awaits the whole run in defaultHandler, and batching holds the thread
// lock until this handler returns. Waiting would queue !stop behind the very run
// it should stop.
async function startTurn(args: Parameters<typeof runTurn>[0]): Promise<void> {
  const { message, thread } = args;
  const refused = await overLimit({
    kind: 'messages',
    userId: message.author.userId,
  });
  if (refused) {
    logger.info('[chat] message limit reached', { threadId: thread.id });
    await thread.postEphemeral(
      message.author,
      "You've hit the hourly message limit, so I'm skipping this one. Try again later.",
      { fallbackToDM: false }
    );
    return;
  }
  runTurn(args).catch((error: unknown) => {
    logger.error('[chat] turn failed', { error, threadId: thread.id });
  });
}

export async function onMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
  { skipped }: ChannelHandlerContext
): Promise<void> {
  if (isFromBot(message)) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  if (await runCommands({ message, skipped, thread })) {
    return;
  }
  await startTurn({ defaultHandler, message, skipped, thread });
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
  { skipped }: ChannelHandlerContext
): Promise<void> {
  if (isFromBot(message) || isComment(message)) {
    return;
  }
  const state = await threadState(thread);
  // A stop or leave_thread sets the cutoff, so anything sent before it was
  // meant for the turn that got stopped.
  if (
    state?.dropMessagesBefore &&
    message.metadata.dateSent.getTime() < state.dropMessagesBefore
  ) {
    return;
  }
  const isFollowingThread = state?.respondOnThreadMessages === true;
  if (!(isFollowingThread || message.isMention)) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    return;
  }
  if (await runCommands({ message, skipped, thread })) {
    return;
  }
  if (
    !(message.isMention || (await shouldRespond({ message, skipped, thread })))
  ) {
    return;
  }
  await startTurn({ defaultHandler, message, skipped, thread });
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
  { skipped }: ChannelHandlerContext
): Promise<void> {
  if (isFromBot(message)) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (await runCommands({ message, skipped, thread })) {
    return;
  }
  await startTurn({ defaultHandler, message, skipped, thread });
}
