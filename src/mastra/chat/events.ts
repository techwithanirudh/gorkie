import { logger } from '../lib/logger';
import { slack } from './client';
import { chat } from './instance';
import { acceptOptIn } from './onboarding';

const STARTERS = [
  {
    title: 'Write & run code',
    message:
      'Write and run a Python script that plots a sine wave and send me the image.',
  },
  {
    title: 'Search the web',
    message: 'What are the top AI news stories today?',
  },
  {
    title: 'Summarize this thread',
    message: 'Summarize what was discussed in this thread so far.',
  },
  {
    title: 'Search Slack',
    message: 'Search Slack for recent decisions about this project.',
  },
];

async function setStarters(channelId: string, threadTs: string): Promise<void> {
  await slack
    .setSuggestedPrompts(channelId, threadTs, STARTERS)
    .catch((error: unknown) =>
      logger.error('[events] setSuggestedPrompts failed', { error })
    );
}

export function registerEvents(): void {
  const bot = chat();

  bot.onAction('opt_in_accept', acceptOptIn);

  bot.onAssistantThreadStarted((event) =>
    setStarters(event.channelId, event.threadTs)
  );

  bot.onAssistantContextChanged((event) =>
    setStarters(event.channelId, event.threadTs)
  );

  bot.onMemberJoinedChannel((event) => {
    if (event.userId !== event.adapter.botUserId) {
      return;
    }

    bot
      .channel(event.channelId)
      .post(
        "hey! i'm hanging out in this channel now! just @ me whenever you need something :)"
      )
      .catch((error: unknown) =>
        logger.error('[events] channel join greeting failed', { error })
      );
  });
}
