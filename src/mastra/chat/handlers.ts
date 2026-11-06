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
function startTurn(args: Parameters<typeof runTurn>[0]): void {
  runTurn(args).catch((error: unknown) => {
    logger.error('[chat] turn failed', { error, threadId: args.thread.id });
  });
}

async function refusedByLimit({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  const refused = await overLimit({
    kind: 'messages',
    userId: message.author.userId,
  });
  if (!refused) {
    return false;
  }
  logger.info('[chat] message limit reached', { threadId: thread.id });
  await thread.postEphemeral(
    message.author,
    "You've hit the hourly message limit, so I'm skipping this one. Try again later.",
    { fallbackToDM: false }
  );
  return true;
}

// Chat state is in memory, so a restart forgets who gorkie follows. A subscribed
// thread whose root mentions gorkie was followed by that mention; only a
// join_thread on some other thread is lost.
async function rootMentionsBot(thread: Thread): Promise<boolean> {
  const { channel, threadTs } = slack.decodeThreadId(thread.id);
  const replies = await slack.webClient.conversations
    .replies({ channel, ts: threadTs, limit: 1 })
    .catch((error: unknown) => {
      logger.warn('[chat] could not read the thread root', {
        error,
        threadId: thread.id,
      });
      return null;
    });
  const following = Boolean(
    slack.botUserId &&
      replies?.messages?.[0]?.text?.includes(`<@${slack.botUserId}`)
  );
  await thread.setState({ respondOnThreadMessages: following });
  return following;
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
  // A batch that mentions gorkie routes every sender here, including bystanders.
  if (![...skipped, message].some(({ isMention }) => isMention)) {
    return;
  }
  const { threadTs } = slack.decodeThreadId(message.threadId);
  if ([...skipped, message].some(({ id }) => id === threadTs)) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  if (
    (await runCommands({ message, skipped, thread })) ||
    (await refusedByLimit({ message, thread }))
  ) {
    return;
  }
  startTurn({ defaultHandler, message, skipped, thread });
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
  const isFollowingThread =
    state?.respondOnThreadMessages ?? (await rootMentionsBot(thread));
  const mentioned = [...skipped, message].some(({ isMention }) => isMention);
  if (!(isFollowingThread || mentioned)) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    return;
  }
  if (
    (await runCommands({ message, skipped, thread })) ||
    (await refusedByLimit({ message, thread }))
  ) {
    return;
  }
  if (!(mentioned || (await shouldRespond({ message, skipped, thread })))) {
    return;
  }
  startTurn({ defaultHandler, message, skipped, thread });
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
  if (
    (await runCommands({ message, skipped, thread })) ||
    (await refusedByLimit({ message, thread }))
  ) {
    return;
  }
  startTurn({ defaultHandler, message, skipped, thread });
}
