import type {
  ActionChannelHandler,
  ChannelHandlerContext,
} from '@mastra/core/channels';
import { type ActionEvent, Message, parseMarkdown, type Thread } from 'chat';
import { limitWindowHours } from '../config';
import { isUserAllowed } from '../lib/allowed-users';
import { parseSlackId } from '../lib/ids';
import { overLimit } from '../lib/limits';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { shouldRespond } from './gate';
import { withHistory } from './history';
import { chat } from './instance';
import { isComment, neutralizeBroadcasts } from './message';
import { banRefusal } from './moderation/cards';
import { banStatus } from './moderation/gate';
import { notify } from './notify';
import { offerOptIn } from './onboarding';
import { followUpActionPrefix } from './reply-card';
import { setThreadState, threadState } from './state';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

function isFromBot(message: Message): boolean {
  return (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  );
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
  author,
  tellUser,
  thread,
}: {
  author: Message['author'];
  tellUser: boolean;
  thread: Thread<unknown>;
}): Promise<boolean> {
  const refused = await overLimit({
    kind: 'tokens',
    userId: author.userId,
  });
  if (!refused) {
    return false;
  }
  logger.info('[chat] message limit reached', { threadId: thread.id });
  if (!tellUser) {
    return true;
  }
  await notify({
    text: `You've hit your ${limitWindowHours}-hour usage limit, so I'm skipping this one. See \`!limits\`, and try again later.`,
    thread,
    user: author,
  });
  return true;
}

async function handledBeforeTurn({
  message,
  skipped,
  tellUser,
  thread,
}: {
  message: Message;
  skipped: readonly Message[];
  tellUser: boolean;
  thread: Thread;
}): Promise<boolean> {
  await Promise.all(
    skipped.map((earlier) => handleCommand({ message: earlier, thread }))
  );
  return (
    (await handleCommand({ message, thread })) ||
    (await refusedByLimit({ author: message.author, tellUser, thread }))
  );
}

async function refusedByBan({
  message,
  tellUser,
  thread,
}: {
  message: Message;
  tellUser: boolean;
  thread: Thread;
}): Promise<boolean> {
  const result = await banStatus(message.author.userId);
  if (result.status === 'clear') {
    return false;
  }
  logger.info('[chat] message refused for a ban', { threadId: thread.id });
  if (tellUser) {
    await notify({
      text: banRefusal(result),
      thread,
      user: message.author,
    });
  }
  return true;
}

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
  if (await refusedByBan({ message, tellUser: true, thread })) {
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
  if (await handledBeforeTurn({ message, skipped, tellUser: true, thread })) {
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
  if (await refusedByBan({ message, tellUser: mentioned, thread })) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    return;
  }
  if (
    await handledBeforeTurn({ message, skipped, tellUser: mentioned, thread })
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
  if (await refusedByBan({ message, tellUser: true, thread })) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (await handledBeforeTurn({ message, skipped, tellUser: true, thread })) {
    return;
  }
  startTurn({ defaultHandler, message, skipped, thread });
}

// Slack can't post as the person who clicked, so it shows under their name and
// avatar marked [gorkie].
async function sendFollowUp(event: ActionEvent): Promise<void> {
  if (!(event.value && event.thread)) {
    return;
  }
  if (!(await isUserAllowed(event.user.userId))) {
    await offerOptIn({ thread: event.thread, user: event.user });
    return;
  }
  if (
    await refusedByLimit({
      author: event.user,
      tellUser: true,
      thread: event.thread,
    })
  ) {
    return;
  }
  const text = neutralizeBroadcasts(event.value);
  const user = await chat()
    .getUser(event.user.userId)
    .catch(() => null);
  const { channel, ts } = parseSlackId(event.threadId);
  if (!channel) {
    return;
  }
  const note = await slack.webClient.chat.postMessage({
    channel,
    thread_ts: ts,
    text,
    username: `${user?.userName || event.user.userName} [gorkie]`.slice(0, 80),
    unfurl_links: false,
    ...(user?.avatarUrl ? { icon_url: user.avatarUrl } : {}),
  });
  if (!note.ts) {
    return;
  }
  await chat().processMessage(
    event.adapter,
    event.threadId,
    new Message({
      id: note.ts,
      threadId: event.threadId,
      text,
      formatted: parseMarkdown(text),
      raw: { text, ts: note.ts, user: event.user.userId },
      author: event.user,
      metadata: { dateSent: new Date(), edited: false },
      attachments: [],
      isMention: true,
    }),
    { deduplicate: false }
  );
}

export const onAction: ActionChannelHandler = async (event, defaultHandler) => {
  const result = await banStatus(event.user.userId);
  if (result.status !== 'clear') {
    await notify({
      text: banRefusal(result),
      thread: event.thread,
      user: event.user,
    });
    return;
  }
  if (event.actionId.startsWith(followUpActionPrefix)) {
    await sendFollowUp(event);
    return;
  }
  await defaultHandler();
};
