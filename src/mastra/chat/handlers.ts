import type {
  ActionChannelHandler,
  ChannelHandler,
} from '@mastra/core/channels';
import type { Message, Thread } from 'chat';
import { logger } from '../lib/logger';
import type { ThreadState } from '../types';
import { optInStatus, rebuildAllowlist } from './allowed-users';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { focusFilter } from './focus';
import { withHistory } from './history';
import { isComment } from './message';
import { banStatus } from './moderation';
import { banNotice } from './moderation/cards';
import { notify } from './notify';
import { offerOptIn } from './onboarding';
import { sentBeforeStop, setThreadState, threadState } from './state';
import { syncTitle } from './title';
import { claimTurn } from './usage';

function isFromBot(message: Message): boolean {
  return message.author.isBot === true || message.author.userId === 'USLACKBOT';
}

async function turnAwayBanned({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  const check = await banStatus(message.author.userId);
  if (check.status !== 'banned') {
    return false;
  }
  declined({ message, reason: 'banned', thread });
  await notify({
    text: banNotice(check.ban.expiresAt),
    thread,
    user: message.author,
  });
  return true;
}

async function turnAwayNotOptedIn({
  message,
  offer,
  thread,
}: {
  message: Message;
  offer: boolean;
  thread: Thread;
}): Promise<boolean> {
  const status = await optInStatus(message.author.userId);
  if (status === 'allowed') {
    return false;
  }
  if (status === 'uncached') {
    // Not awaited: paging a large channel's members would hold this reply.
    rebuildAllowlist().catch((error: unknown) =>
      logger.error('[allowlist] failed to rebuild opt-in cache', { error })
    );
  }
  declined({
    message,
    reason:
      status === 'not-allowed'
        ? 'not on the allow-list'
        : 'could not check the allow-list',
    thread,
  });
  if (!offer) {
    return true;
  }
  if (status === 'not-allowed') {
    await offerOptIn({ thread, user: message.author });
    return true;
  }
  await notify({
    text: "i couldn't check whether you've opted in just now. try again in a minute.",
    thread,
    user: message.author,
  });
  return true;
}

async function turnAwayUnfocused({
  message,
  sees,
  thread,
}: {
  message: Message;
  sees: ((userId: string) => boolean) | undefined;
  thread: Thread;
}): Promise<boolean> {
  if (!sees || sees(message.author.userId)) {
    return false;
  }
  declined({ message, reason: 'outside the thread focus', thread });
  if (message.isMention) {
    await notify({
      text: "i'm focused on specific people in this thread, so i can't pick this up. whoever brought me in can run `!focus off`.",
      thread,
      user: message.author,
    });
  }
  return true;
}

function declined({
  message,
  reason,
  thread,
}: {
  message: Message;
  reason: string;
  thread: Thread;
}): void {
  logger.debug('[chat] message not answered', {
    author: message.author.userName,
    isMention: message.isMention,
    messageId: message.id,
    reason,
    threadId: thread.id,
  });
}

async function runTurn({
  defaultHandler,
  follow = false,
  message,
  sees,
  state,
  thread,
}: {
  defaultHandler: Parameters<ChannelHandler>[2];
  follow?: boolean;
  message: Message;
  sees: ((userId: string) => boolean) | undefined;
  state: ThreadState | null;
  thread: Thread;
}): Promise<void> {
  logger.info('[chat] turn started', {
    threadId: thread.id,
    author: message.author.userName,
    attachments: message.attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
    })),
  });

  if (sentBeforeStop({ message, state })) {
    declined({ message, reason: 'sent before a stop or leave', thread });
    return;
  }
  const claim = await claimTurn(message.author.userId);
  if (claim.status === 'over-limit') {
    declined({ message, reason: 'over the turn limit', thread });
    await notify({
      text: claim.notice,
      thread,
      user: message.author,
    });
    return;
  }
  const prompt = await withHistory({
    message: attachments(message),
    sees,
    state,
    thread,
  });
  if (follow) {
    await setThreadState({ thread, patch: { respondOnThreadMessages: true } });
  }
  await defaultHandler(thread, prompt);
  if (!thread.isDM) {
    await setThreadState({ thread, patch: { lastSeenMessage: message.id } });
    return;
  }
  // Not awaited: generating a title is a model call, and the handler should
  // not hold the thread's next message behind it.
  syncTitle({ message, thread }).catch((error: unknown) => {
    logger.warn('[chat] could not set the thread title', {
      error,
      threadId: thread.id,
    });
  });
}

export const onMention: ChannelHandler = async (
  thread,
  message,
  defaultHandler
) => {
  if (isFromBot(message)) {
    declined({ message, reason: 'from a bot', thread });
    return;
  }
  if (await turnAwayBanned({ message, thread })) {
    return;
  }
  if (await turnAwayNotOptedIn({ message, offer: true, thread })) {
    return;
  }
  const state = await threadState(thread);
  const sees = thread.isDM
    ? undefined
    : await focusFilter({ state, threadId: thread.id });
  if (await turnAwayUnfocused({ message, sees, thread })) {
    return;
  }
  if (await handleCommand({ message, state, thread })) {
    return;
  }
  await runTurn({
    defaultHandler,
    follow: slack.decodeThreadId(message.threadId).threadTs === message.id,
    message,
    sees,
    state,
    thread,
  });
};

export const onSubscribedMessage: ChannelHandler = async (
  thread,
  message,
  defaultHandler
) => {
  if (isFromBot(message) || isComment(message)) {
    declined({
      message,
      reason: isFromBot(message) ? 'from a bot' : 'a comment',
      thread,
    });
    return;
  }
  const state = await threadState(thread);
  const isFollowingThread = state?.respondOnThreadMessages === true;
  if (!(isFollowingThread || message.isMention)) {
    declined({
      message,
      reason: 'not a mention and not following this thread',
      thread,
    });
    return;
  }
  if (message.isMention) {
    if (await turnAwayBanned({ message, thread })) {
      return;
    }
  } else if ((await banStatus(message.author.userId)).status === 'banned') {
    declined({ message, reason: 'banned', thread });
    return;
  }
  if (
    await turnAwayNotOptedIn({
      message,
      offer: message.isMention === true,
      thread,
    })
  ) {
    return;
  }
  const sees = thread.isDM
    ? undefined
    : await focusFilter({ state, threadId: thread.id });
  if (await turnAwayUnfocused({ message, sees, thread })) {
    return;
  }
  if (await handleCommand({ message, state, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, sees, state, thread });
};

export const onDirectMessage: ChannelHandler = async (
  thread,
  message,
  defaultHandler
) => {
  if (isFromBot(message)) {
    declined({ message, reason: 'from a bot', thread });
    return;
  }
  if (await turnAwayBanned({ message, thread })) {
    return;
  }
  if (await turnAwayNotOptedIn({ message, offer: true, thread })) {
    return;
  }
  const state = await threadState(thread);
  if (await handleCommand({ message, state, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, sees: undefined, state, thread });
};

// defaultHandler is Mastra's tool approve/deny button handler.
export const onAction: ActionChannelHandler = async (event, defaultHandler) => {
  const check = await banStatus(event.user.userId);
  if (check.status !== 'banned') {
    await defaultHandler();
    return;
  }
  await notify({
    text: banNotice(check.ban.expiresAt),
    thread: event.thread,
    user: event.user,
  });
};
