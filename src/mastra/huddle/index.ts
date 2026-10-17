import { env } from '@/env';
import { isUserAllowed } from '../lib/allowed-users';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import type { HuddleEvent, JoinedHuddle } from '../types';
import { liveHuddles } from './live';
import { HuddleSession } from './session';
import { HuddleSlack } from './slack';

let huddles: { slack: HuddleSlack; apiKey: string } | undefined;
const joining = new Set<string>();
const endedWhileJoining = new Set<string>();

async function startSession({
  joined,
  actingAs,
  apiKey,
}: {
  joined: JoinedHuddle;
  actingAs: string;
  apiKey: string;
}) {
  if (endedWhileJoining.delete(joined.callId)) {
    return;
  }
  const session = new HuddleSession({
    joined,
    actingAs,
    apiKey,
    onEnd: () => liveHuddles.delete(joined.callId),
  });
  liveHuddles.set(joined.callId, session);
  await session.start().catch(async (error: unknown) => {
    await session.end('failed to start');
    throw error;
  });
}

export async function joinHuddle({
  channelId,
  requesterId,
}: {
  channelId: string;
  requesterId: string;
}): Promise<boolean> {
  if (!huddles) {
    throw new Error('Huddles are not running on this gorkie.');
  }
  const channel = rawId(channelId);
  if ([...liveHuddles.values()].some((live) => live.channelId === channel)) {
    return false;
  }
  if (!(await isUserAllowed(requesterId))) {
    throw new Error('Only opted-in members can bring gorkie into a huddle.');
  }
  const { slack, apiKey } = huddles;
  await slack.enterChannel(channel);
  const joined = await slack.join(channel);
  if (liveHuddles.has(joined.callId) || joining.has(joined.callId)) {
    return false;
  }
  joining.add(joined.callId);
  try {
    await startSession({ joined, actingAs: requesterId, apiKey });
  } finally {
    joining.delete(joined.callId);
    endedWhileJoining.delete(joined.callId);
  }
  return true;
}

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

  const join = async (event: Extract<HuddleEvent, { type: 'invited' }>) => {
    if (liveHuddles.has(event.callId) || joining.has(event.callId)) {
      return;
    }
    joining.add(event.callId);
    try {
      if (!(await isUserAllowed(event.inviterId))) {
        logger.info(
          '[huddle] ignored invite from a user outside the allowlist',
          { inviterId: event.inviterId }
        );
        return;
      }
      const joined = event.chime
        ? await slack.joinInvited({
            callId: event.callId,
            channelId: event.channelId,
            chime: event.chime,
          })
        : await slack.join(event.channelId);
      await startSession({ joined, actingAs: event.inviterId, apiKey });
    } finally {
      joining.delete(event.callId);
      endedWhileJoining.delete(event.callId);
    }
  };

  function handle(event: HuddleEvent) {
    if (event.type === 'invited') {
      join(event).catch((error: unknown) =>
        logger.error('[huddle] failed to join', { callId: event.callId, error })
      );
      return;
    }
    const session = liveHuddles.get(event.callId);
    if (event.type === 'ended') {
      if (!session && joining.has(event.callId)) {
        endedWhileJoining.add(event.callId);
      }
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
  huddles = { slack, apiKey };
  logger.info('[huddle] listening for huddle invites', {
    userId: slack.userId,
  });
}
