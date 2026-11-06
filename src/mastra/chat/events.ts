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
import { registerModeration } from './moderation';
import { guarded } from './moderation/gate';
import { acceptOptIn } from './onboarding';
import { onSendCancel, onSendConfirm, sendIds } from './send';

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
  registerModeration();

  bot.onAction('opt_in_accept', acceptOptIn);

  bot.onAction(sendIds.confirm, guarded(onSendConfirm));
  bot.onAction(sendIds.cancel, guarded(onSendCancel));

  bot.onAction(feedbackIds.action, guarded(onFeedbackClick));
  bot.onModalSubmit(
    feedbackIds.modal,
    guarded((event) =>
      recordFeedbackDetails({ comment: event.values.details, event })
    )
  );
  bot.onModalClose(
    feedbackIds.modal,
    guarded((event) => recordFeedbackDetails({ event }))
  );
}
