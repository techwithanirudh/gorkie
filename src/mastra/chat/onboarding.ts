import type { Thread } from 'chat';
import {
  type ActionEvent,
  Actions,
  type Author,
  Button,
  Card,
  CardText,
} from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import { addAllowedUser } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import { slack } from './client';

const slackErrorSchema = z.looseObject({
  data: z
    .looseObject({
      error: z.string().optional(),
    })
    .optional(),
});

export async function offerOptIn(thread: Thread, user: Author): Promise<void> {
  if (!env.OPT_IN_CHANNEL) {
    return;
  }
  try {
    await thread.postEphemeral(
      user,
      Card({
        title: ':wave: first time meeting gorkie',
        children: [
          CardText(
            `hi! i'm gorkie. before i can help, you need to accept the terms posted in <#${env.OPT_IN_CHANNEL}>.`
          ),
          CardText(
            "tap below to opt in, i'll add you to the terms channel and we can get started."
          ),
          Actions([
            Button({
              id: 'opt_in_accept',
              label: 'i accept, opt me in',
              style: 'primary',
              value: thread.id,
            }),
          ]),
        ],
      }),
      { fallbackToDM: true }
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
  await addAllowedUser(userId);
  await inviteToOptInChannel(userId);
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

async function inviteToOptInChannel(userId: string): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }
  try {
    await slack.webClient.conversations.invite({ channel, users: userId });
  } catch (error) {
    // Already a member is success; external users can't be invited (we log it).
    const slackError = slackErrorSchema.safeParse(error).data?.data?.error;
    if (slackError === 'already_in_channel') {
      return;
    }
    logger.warn('[onboarding] failed to invite to opt-in channel', {
      channel,
      error,
      userId,
    });
  }
}
