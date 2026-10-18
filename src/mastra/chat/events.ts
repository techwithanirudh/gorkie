import { logger } from '../lib/logger';
import { registerAppHome } from './app-home';
import { slack } from './client';
import { content } from './content';
import {
  feedbackIds,
  onFeedbackClick,
  recordFeedbackDetails,
} from './feedback';
import { chat } from './instance';
import { acceptOptIn } from './onboarding';

export function registerEvents(): void {
  const bot = chat();

  bot.onAssistantContextChanged((event) =>
    slack
      .setSuggestedPrompts(event.channelId, event.threadTs, content.starters)
      .catch((error: unknown) =>
        logger.error('[events] setSuggestedPrompts failed', { error })
      )
  );

  registerAppHome();

  bot.onAction('opt_in_accept', acceptOptIn);

  bot.onAction(feedbackIds.action, onFeedbackClick);
  bot.onModalSubmit(feedbackIds.modal, (event) =>
    recordFeedbackDetails({ comment: event.values.details, event })
  );
  bot.onModalClose(feedbackIds.modal, (event) =>
    recordFeedbackDetails({ event })
  );
}
