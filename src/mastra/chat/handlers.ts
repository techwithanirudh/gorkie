import type {
  ActionChannelHandler,
  ChannelHandler,
} from '@mastra/core/channels';
import type { Message, Thread } from 'chat';
import { optInStatus } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { focusFilter } from './focus';
import { withHistory } from './history';
import { isComment } from './message';
import { banNotice, isBanned } from './moderation';
import { notify } from './notify';
import { offerOptIn } from './onboarding';
import { setThreadState, threadState } from './state';
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
  const ban = await isBanned(message.author.userId);
  if (!ban) {
    return false;
  }
  declined({ message, reason: 'banned', thread });
  await notify({
    text: banNotice(ban.expiresAt),
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
  declined({
    message,
    reason:
      status === 'unknown'
        ? 'could not check the allow-list'
        : 'not on the allow-list',
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
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  if (thread.isDM) {
    return false;
  }
  const sees = await focusFilter(thread.id);
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
  thread,
}: {
  defaultHandler: Parameters<ChannelHandler>[2];
  follow?: boolean;
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
      url: attachment.url,
    })),
  });

  const prompt = await withHistory({ message: attachments(message), thread });
  // Checked last, after the slow steps: a message can sit in a handler (or a
  // Slack redelivery) long enough for a stop or leave_thread to land first.
  const state = await threadState(thread);
  if (
    state?.dropMessagesBefore &&
    message.metadata.dateSent.getTime() < state.dropMessagesBefore
  ) {
    declined({ message, reason: 'sent before a stop or leave', thread });
    return;
  }
  const overLimit = await claimTurn(message.author.userId);
  if (overLimit) {
    declined({ message, reason: 'over the turn limit', thread });
    await notify({
      text: overLimit,
      thread,
      user: message.author,
    });
    return;
  }
  // Only once the turn is really going to run: a command, a dropped message or
  // one over the limit must not leave gorkie answering the whole thread.
  if (follow) {
    await setThreadState({ thread, patch: { respondOnThreadMessages: true } });
  }
  await defaultHandler(thread, prompt);
  if (!thread.isDM) {
    await setThreadState({ thread, patch: { lastSeenMessage: message.id } });
    return;
  }
  // Not awaited: the title is cosmetic and its model call must not hold up the
  // next message in this thread. syncTitle logs its own failures.
  syncTitle({ message, thread });
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
  if (await turnAwayUnfocused({ message, thread })) {
    return;
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({
    defaultHandler,
    follow: slack.decodeThreadId(message.threadId).threadTs === message.id,
    message,
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
  } else if (await isBanned(message.author.userId)) {
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
  if (await turnAwayUnfocused({ message, thread })) {
    return;
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, thread });
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
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, thread });
};

// Also gates Mastra's built-in tool approve/deny buttons, so a banned person
// cannot let a pending tool call run.
export const onAction: ActionChannelHandler = async (event, defaultHandler) => {
  const ban = await isBanned(event.user.userId);
  if (!ban) {
    await defaultHandler();
    return;
  }
  await notify({
    text: banNotice(ban.expiresAt),
    thread: event.thread,
    user: event.user,
  });
};
