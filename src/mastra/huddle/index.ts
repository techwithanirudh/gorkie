import { env } from '@/env';
import { slack as bot } from '../chat/client';
import { isUserAllowed } from '../lib/allowed-users';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import type { HuddleEvent, JoinedHuddle } from '../types';
import { huddleAccount } from './account';
import { HuddleSession } from './session';
import { HuddleSlack } from './slack';

export async function startHuddles(): Promise<void> {
  const {
    DEEPGRAM_API_KEY: apiKey,
    HUDDLE_WORKSPACE_URL: workspaceUrl,
    HUDDLE_XOXC: xoxc,
    HUDDLE_XOXD: xoxd,
  } = env;
  if (!(apiKey && workspaceUrl && xoxc && xoxd)) {
    return;
  }
  const sessions = new Map<string, HuddleSession>();
  const joining = new Set<string>();

  const join = async (event: Extract<HuddleEvent, { type: 'invited' }>) => {
    if (sessions.has(event.callId) || joining.has(event.callId)) {
      return;
    }
    if (!(await isUserAllowed(event.inviterId))) {
      logger.info('[huddle] ignored invite from a user outside the allowlist', {
        inviterId: event.inviterId,
      });
      return;
    }
    joining.add(event.callId);
    try {
      const joined = event.chime
        ? await slack.joinInvited({
            callId: event.callId,
            channelId: event.channelId,
            chime: event.chime,
          })
        : await slack.join(event.channelId);
      await startSession({ joined, inviterId: event.inviterId });
    } finally {
      joining.delete(event.callId);
    }
  };

  const startSession = async ({
    joined,
    inviterId,
  }: {
    joined: JoinedHuddle;
    inviterId: string;
  }) => {
    const session = new HuddleSession({
      joined,
      inviterId,
      apiKey,
      onEnd: () => sessions.delete(joined.callId),
    });
    sessions.set(joined.callId, session);
    await session.start().catch(async (error: unknown) => {
      await session.end('failed to start');
      throw error;
    });
  };

  // Asked for in text rather than by an invite: get the huddle account into
  // the channel, then `rooms.join` joins the channel's huddle, starting one
  // when none is running.
  const joinChannel = async ({
    channelId,
    inviterId,
  }: {
    channelId: string;
    inviterId: string;
  }) => {
    const channel = rawId(channelId);
    const running = [...sessions.values()].find(
      (session) => session.channelId === channel
    );
    if (running) {
      return { callId: running.callId, alreadyThere: true };
    }
    if (joining.has(channel)) {
      throw new Error('Already joining this channel huddle.');
    }
    if (!(await isUserAllowed(inviterId))) {
      throw new Error('The requester has not opted in to gorkie.');
    }
    joining.add(channel);
    try {
      // The huddle account joins a public channel itself. For a private one
      // the bot, already a member since it was asked there, invites it.
      const member =
        (await slack.joinConversation(channel).catch(() => false)) ||
        (await bot.webClient.conversations
          .invite({ channel, users: slack.userId ?? '' })
          .then(() => true)
          .catch((error: unknown) => {
            logger.debug('[huddle] could not invite the huddle account', {
              channel,
              error,
            });
            return false;
          }));
      const joined = await slack.join(channel).catch((error: unknown) => {
        throw new Error(
          member
            ? 'Could not join the huddle.'
            : `Could not get <@${slack.userId}> into this channel; someone needs to add it first.`,
          { cause: error }
        );
      });
      await startSession({ joined, inviterId });
      return { callId: joined.callId, alreadyThere: false };
    } finally {
      joining.delete(channel);
    }
  };

  function handle(event: HuddleEvent) {
    if (event.type === 'invited') {
      join(event).catch((error: unknown) =>
        logger.error('[huddle] failed to join', { callId: event.callId, error })
      );
      return;
    }
    const session = sessions.get(event.callId);
    if (event.type === 'ended') {
      session?.end('huddle ended').catch(() => undefined);
      return;
    }
    if (event.userId === slack.userId) {
      session?.end('removed from the huddle').catch(() => undefined);
    }
  }

  const slack = new HuddleSlack({
    workspaceUrl,
    xoxc,
    xoxd,
    mediaRegion: env.HUDDLE_MEDIA_REGION,
    onEvent: handle,
  });
  await slack.start();
  huddleAccount.userId = slack.userId;
  huddleAccount.join = joinChannel;
  logger.info('[huddle] listening for huddle invites', {
    userId: slack.userId,
  });
}
