import { env } from '@/env';
import { isUserAllowed } from '../lib/allowed-users';
import { logger } from '../lib/logger';
import type { HuddleEvent } from '../types';
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
      const session = new HuddleSession({
        joined,
        inviterId: event.inviterId,
        apiKey,
        onEnd: () => sessions.delete(joined.callId),
      });
      sessions.set(joined.callId, session);
      await session.start().catch(async (error: unknown) => {
        await session.end('failed to start');
        throw error;
      });
    } finally {
      joining.delete(event.callId);
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
  logger.info('[huddle] listening for huddle invites', {
    userId: slack.userId,
  });
}
