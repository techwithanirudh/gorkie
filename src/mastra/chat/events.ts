import { Chat } from 'chat';
import { agent as agentConfig } from '../config';
import { logger } from '../lib/logger';
import { registerAppHome } from './app-home';
import { askActionIds, onAskClick } from './ask-user';
import { slack } from './client';
import { stopThread } from './commands/stop';
import { content } from './content';
import {
  feedbackIds,
  onFeedbackClick,
  recordFeedbackDetails,
} from './feedback';
import { getMastra } from './mastra-instance';
import { isBlocked, registerModeration } from './moderation';
import { acceptOptIn, optInIds } from './onboarding';

export function registerEvents(): void {
  const bot = Chat.getSingleton();

  slack.onThreadStop(async ({ threadId, userId, stoppedAt }) => {
    if (await isBlocked(userId)) {
      return;
    }
    await bot.abortTurn(threadId);
    const outcome = await stopThread({ threadId, stoppedAt });
    logger.info('[events] thread stop', { outcome, threadId });
  });

  bot.onAssistantContextChanged((event) =>
    slack
      .setSuggestedPrompts(event.channelId, event.threadTs, content.starters)
      .catch((error: unknown) =>
        logger.error('[events] setSuggestedPrompts failed', { error })
      )
  );

  // The Slack adapter aborts its own Chat SDK turn on the native stop button,
  // but channels never hands that signal to the Mastra run, so stop it here.
  bot.onAgentSessionStopped(async (event) => {
    if (await isBlocked(event.userId)) {
      return;
    }
    if (!event.threadTs && (await slack.isCodeChannel(event.channelId))) {
      const prefix = slack.encodeThreadId({
        channel: event.channelId,
        threadTs: '',
      });
      const threads = new Set([event.threadId]);
      for (const run of getMastra()
        .getAgentById(agentConfig.id)
        .listActiveThreadRuns()) {
        if (run.threadId.startsWith(prefix)) {
          threads.add(run.threadId);
        }
      }
      await Promise.all(
        [...threads].map(async (threadId) => {
          await bot.abortTurn(threadId);
          const outcome = await stopThread({ threadId });
          logger.info('[events] native channel stop', { outcome, threadId });
        })
      );
      return;
    }
    const outcome = await stopThread({ threadId: event.threadId });
    logger.info('[events] native stop', { outcome, threadId: event.threadId });
  });

  registerAppHome();
  registerModeration();

  bot.onAction(optInIds.accept, acceptOptIn);

  bot.onAction(askActionIds, onAskClick);

  bot.onAction(feedbackIds.action, onFeedbackClick);
  bot.onModalSubmit(feedbackIds.modal, (event) =>
    recordFeedbackDetails({ comment: event.values.details, event })
  );
  bot.onModalClose(feedbackIds.modal, (event) =>
    recordFeedbackDetails({ event })
  );
}
