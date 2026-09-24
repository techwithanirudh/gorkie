import type { ChannelHandler } from '@mastra/core/channels';
import type { Message, Thread } from 'chat';
import { isUserAllowed } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { withHistory } from './history';
import { isComment } from './message';
import { offerOptIn } from './onboarding';
import { setThreadState, threadState } from './state';

function isFromBot(message: Message): boolean {
  return message.author.isBot === true || message.author.userId === 'USLACKBOT';
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
  message,
  thread,
}: {
  defaultHandler: Parameters<ChannelHandler>[2];
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
    textLength: message.text.length,
  });

  await defaultHandler(
    thread,
    await withHistory({ message: attachments(message), thread })
  );
  if (!thread.isDM) {
    await setThreadState({ thread, patch: { lastSeenMessage: message.id } });
  }
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
  if (!(await isUserAllowed(message.author.userId))) {
    declined({ message, reason: 'not on the allow-list', thread });
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await setThreadState({ thread, patch: { respondOnThreadMessages: true } });
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, thread });
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
  if (!(await isUserAllowed(message.author.userId))) {
    declined({ message, reason: 'not on the allow-list', thread });
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
  if (!(await isUserAllowed(message.author.userId))) {
    declined({ message, reason: 'not on the allow-list', thread });
    await offerOptIn({ thread, user: message.author });
    return;
  }
  if (await handleCommand({ message, thread })) {
    return;
  }
  await runTurn({ defaultHandler, message, thread });
};
