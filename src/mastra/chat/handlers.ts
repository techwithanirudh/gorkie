import type {
  ActionChannelHandler,
  ChannelHandlerContext,
} from '@mastra/core/channels';
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
import { banRefusal } from './moderation/cards';
import { banStatus, isBanned } from './moderation/gate';
import { notify } from './notify';
import { offerOptIn } from './onboarding';
import { setThreadState, threadState } from './state';

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

  // Channels spends seconds on memory and setup before it sets a status itself.
  thread.startTyping('is thinking…').catch((error: unknown) => {
    logger.debug('[chat] could not set the first status', { error });
  });
  await defaultHandler(
    thread,
    await withHistory({ message: attachments(message), skipped, thread })
  );
  // Only a turn that finished has seen the backfill; a failed one retries it.
  if (!thread.isDM) {
    await setThreadState({ thread, patch: { lastSeenMessage: message.id } });
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
    kind: 'tokens',
    userId: message.author.userId,
  });
  if (!refused) {
    return false;
  }
  logger.info('[chat] message limit reached', { threadId: thread.id });
  await thread.postEphemeral(
    message.author,
    "You've hit your hourly usage limit, so I'm skipping this one. See `!limits`, and try again later.",
    { fallbackToDM: false }
  );
  return true;
}

// Fails closed: a ban that cannot be checked refuses the message. Every author
// in the batch is checked, though a batch comes from one sender.
async function refusedByBan({
  message,
  skipped,
  speak,
  thread,
}: {
  message: Message;
  skipped: readonly Message[];
  speak: boolean;
  thread: Thread;
}): Promise<boolean> {
  const authors = new Set(
    [...skipped, message].map(({ author }) => author.userId)
  );
  const statuses = await Promise.all(
    [...authors].map(async (userId) => ({
      userId,
      result: await banStatus(userId),
    }))
  );
  if (statuses.every(({ result }) => result.status === 'clear')) {
    return false;
  }
  logger.info('[chat] message refused for a ban', { threadId: thread.id });
  const own = statuses.find(({ userId }) => userId === message.author.userId);
  if (speak && own && own.result.status !== 'clear') {
    await notify({
      text: banRefusal(own.result),
      thread,
      user: message.author,
    });
  }
  return true;
}

// Threads from before thread state was stored have no flag. A subscribed thread
// whose root mentions gorkie was followed by that mention.
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
  if (replies) {
    await setThreadState({
      thread,
      patch: { respondOnThreadMessages: following },
    });
  }
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
  // A batch that mentions gorkie routes every sender here, including bystanders.
  if (![...skipped, message].some(({ isMention }) => isMention)) {
    return;
  }
  if (await refusedByBan({ message, skipped, speak: true, thread })) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn({ thread, user: message.author });
    return;
  }
  const { threadTs } = slack.decodeThreadId(message.threadId);
  if ([...skipped, message].some(({ id }) => id === threadTs)) {
    await setThreadState({ thread, patch: { respondOnThreadMessages: true } });
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
  if (await refusedByBan({ message, skipped, speak: mentioned, thread })) {
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
  if (await refusedByBan({ message, skipped, speak: true, thread })) {
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

// defaultHandler is Mastra's tool approve and deny button handler.
export const onAction: ActionChannelHandler = async (event, defaultHandler) => {
  if (!(await isBanned(event.user.userId))) {
    await defaultHandler();
    return;
  }
  await notify({
    text: "You're banned from Gorkie.",
    thread: event.thread,
    user: event.user,
  });
};
