import type {
  ActionChannelHandler,
  ChannelHandler,
} from '@mastra/core/channels';
import type { Message, Thread } from 'chat';
import { z } from 'zod';
import { logger } from '../lib/logger';
import type { ThreadState } from '../types';
import { optInStatus, rebuildAllowlist } from './allowed-users';
import { appendAttachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { prependHistory } from './history';
import { ignoredMessageReason, rawText } from './message';
import { banStatus } from './moderation';
import { banNotice } from './moderation/cards';
import { notify } from './notify';
import { offerOptIn } from './onboarding';
import { sentBeforeStop, setThreadState, threadStateOrNull } from './state';
import { syncTitle } from './title';
import { claimTurn } from './usage';

const messageActionToken = z.looseObject({
  action_token: z.string().min(1).optional(),
});

function isFromBot(message: Message): boolean {
  return message.author.isBot === true || message.author.userId === 'USLACKBOT';
}

async function admit({
  message,
  notice,
  thread,
}: {
  message: Message;
  notice: 'send' | 'silent';
  thread: Thread;
}): Promise<boolean> {
  const ban = await banStatus(message.author.userId);
  if (ban.status === 'banned') {
    declined({ message, reason: 'banned', thread });
    if (notice === 'send') {
      await notify({
        text: banNotice(ban.ban.expiresAt),
        thread,
        user: message.author,
      });
    }
    return false;
  }
  const optIn = await optInStatus(message.author.userId);
  if (optIn === 'allowed') {
    return true;
  }
  if (optIn === 'list-not-loaded') {
    // Not awaited: paging a large channel's members would hold this reply.
    rebuildAllowlist().catch((error: unknown) =>
      logger.error('[allowlist] failed to rebuild opt-in cache', { error })
    );
  }
  declined({
    message,
    reason:
      optIn === 'not-allowed'
        ? 'not on the allow-list'
        : 'could not check the allow-list',
    thread,
  });
  if (notice === 'silent') {
    return false;
  }
  if (optIn === 'not-allowed') {
    await offerOptIn({ thread, user: message.author });
    return false;
  }
  await notify({
    text: "i couldn't check whether you've opted in just now. try again in a minute.",
    thread,
    user: message.author,
  });
  return false;
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
  context,
  follow = false,
  message,
  state,
  thread,
}: {
  defaultHandler: Parameters<ChannelHandler>[2];
  context: Parameters<ChannelHandler>[3];
  follow?: boolean;
  message: Message;
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
  appendAttachments(message);
  await prependHistory({ message, state, thread });
  if (follow) {
    await thread.subscribe();
    await setThreadState({ thread, patch: { respondOnThreadMessages: true } });
  }
  const token = messageActionToken.safeParse(message.raw).data?.action_token;
  if (token) {
    context.requestContext.set('slackSearchActionToken', token);
  }
  await defaultHandler(thread, message);
  // MastraStateAdapter.subscribe() does nothing until channels has created the
  // memory thread, which happens inside defaultHandler, so the subscribe above
  // is lost on a thread's first turn. Re-read state so leave_thread still wins.
  if (follow && (await threadStateOrNull(thread))?.respondOnThreadMessages) {
    await thread.subscribe();
  }
  if (!thread.isDM) {
    await setThreadState({ thread, patch: { lastSeenMessage: message.id } });
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

async function answer({
  context,
  defaultHandler,
  follow,
  message,
  thread,
}: {
  context: Parameters<ChannelHandler>[3];
  defaultHandler: Parameters<ChannelHandler>[2];
  follow: boolean;
  message: Message;
  thread: Thread;
}): Promise<void> {
  const reason = ignoredMessageReason({
    text: rawText(message),
    botUserId: slack.botUserId,
  });
  if (reason) {
    declined({ message, reason, thread });
    return;
  }
  if (isFromBot(message)) {
    declined({ message, reason: 'from a bot', thread });
    return;
  }
  if (!(await admit({ message, notice: 'send', thread }))) {
    return;
  }
  const state = await threadStateOrNull(thread);
  if (await handleCommand({ message, state, thread })) {
    return;
  }
  // A thread we follow but are not subscribed to (the first-turn bug above)
  // routes here; following it again heals the subscription.
  await runTurn({
    context,
    defaultHandler,
    follow: follow || state?.respondOnThreadMessages === true,
    message,
    state,
    thread,
  });
}

export const onMention: ChannelHandler = (
  thread,
  message,
  defaultHandler,
  context
) =>
  answer({
    context,
    defaultHandler,
    follow: slack.decodeThreadId(message.threadId).threadTs === message.id,
    message,
    thread,
  });

export const onDirectMessage: ChannelHandler = (
  thread,
  message,
  defaultHandler,
  context
) => answer({ context, defaultHandler, follow: false, message, thread });

export const onSubscribedMessage: ChannelHandler = async (
  thread,
  message,
  defaultHandler,
  context
) => {
  const reason = ignoredMessageReason({
    text: rawText(message),
    botUserId: slack.botUserId,
  });
  if (isFromBot(message) || reason) {
    declined({
      message,
      reason: isFromBot(message) ? 'from a bot' : reason || 'a comment',
      thread,
    });
    return;
  }
  const state = await threadStateOrNull(thread);
  const { channel, threadTs } = slack.decodeThreadId(thread.id);
  const isFollowingThread =
    state?.respondOnThreadMessages === true ||
    (state?.respondOnThreadMessages !== false &&
      !threadTs &&
      (await slack.isAssignedCodeChannel(channel)));
  if (!(isFollowingThread || message.isMention)) {
    declined({
      message,
      reason: 'not a mention and not following this thread',
      thread,
    });
    return;
  }
  if (
    !(await admit({
      message,
      notice: message.isMention ? 'send' : 'silent',
      thread,
    }))
  ) {
    return;
  }
  if (await handleCommand({ message, state, thread })) {
    return;
  }
  await runTurn({ context, defaultHandler, message, state, thread });
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
