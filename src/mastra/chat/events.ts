import { Chat } from 'chat';
import { isUserAllowed } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import { registerAppHome } from './app-home';
import { slack } from './client';
import { stopThread } from './commands/stop';
import { content } from './content';
import {
  feedbackIds,
  onFeedbackClick,
  recordFeedbackDetails,
} from './feedback';
import { isBanned, registerModeration } from './moderation';
import { acceptOptIn, optInIds } from './onboarding';

export function registerEvents(): void {
  const bot = Chat.getSingleton();

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
    if (
      !(await isUserAllowed(event.userId)) ||
      (await isBanned(event.userId))
    ) {
      return;
    }
    const outcome = await stopThread(event.threadId);
    logger.info('[events] native stop', { outcome, threadId: event.threadId });
  });

  registerAppHome();
  registerModeration();

  bot.onAction(optInIds.accept, acceptOptIn);

  bot.onAction(feedbackIds.action, onFeedbackClick);
  bot.onModalSubmit(feedbackIds.modal, (event) =>
    recordFeedbackDetails({ comment: event.values.details, event })
  );
  bot.onModalClose(feedbackIds.modal, (event) =>
    recordFeedbackDetails({ event })
  );
}
