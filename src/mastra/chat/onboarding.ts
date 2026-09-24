import type { Thread } from 'chat';
import {
  type ActionEvent,
  Actions,
  type Author,
  Button,
  Card,
  CardText,
} from 'chat';
import { env } from '@/env';
import { setMembership } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import { ALREADY_IN_CHANNEL } from '../lib/logger/slack';
import { slackErrorSchema } from '../types';
import { slack } from './client';

export const optInIds = {
  accept: 'opt_in_accept',
};

export async function offerOptIn({
  thread,
  user,
}: {
  thread: Thread;
  user: Author;
}): Promise<void> {
  if (!env.OPT_IN_CHANNEL) {
    return;
  }
  try {
    await thread.post(
      Card({
        title: ':wave: first time meeting gorkie',
        children: [
          CardText(
            `hi <@${user.userId}>! i'm gorkie. before i can help, you need to accept the terms posted in <#${env.OPT_IN_CHANNEL}>.`
          ),
          CardText(
            "tap below to opt in, i'll add you to the terms channel and we can get started."
          ),
          Actions([
            Button({
              id: optInIds.accept,
              label: 'i accept, opt me in',
              style: 'primary',
              value: thread.id,
            }),
          ]),
        ],
      })
    );
  } catch (error) {
    logger.warn('[onboarding] failed to offer opt-in', {
      error,
      userId: user.userId,
    });
  }
}

export async function acceptOptIn(event: ActionEvent): Promise<void> {
  const {
    user,
    user: { userId },
    thread,
  } = event;
  await setMembership({ allowed: true, userId });
  const channel = env.OPT_IN_CHANNEL;
  if (channel) {
    try {
      await slack.webClient.conversations.invite({ channel, users: userId });
    } catch (error) {
      const slackError = slackErrorSchema.safeParse(error).data?.data?.error;
      if (slackError !== ALREADY_IN_CHANNEL) {
        logger.warn('[onboarding] failed to invite to opt-in channel', {
          channel,
          error,
          userId,
        });
      }
    }
  }
  if (!thread) {
    return;
  }
  await thread
    .postEphemeral(
      user,
      "you're all set, welcome to gorkie. ask me anything.",
      {
        fallbackToDM: true,
      }
    )
    .catch((error: unknown) => {
      logger.warn('[onboarding] failed to confirm opt-in', { error, userId });
    });
}
