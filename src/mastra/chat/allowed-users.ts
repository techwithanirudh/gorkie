import { Chat } from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import { slack as slackConfig } from '../config';
import { logger } from '../lib/logger';
import { slack } from './client';

type OptInStatus = 'allowed' | 'not-allowed' | 'unknown' | 'list-not-loaded';

const storedUsers = z.array(z.string()).nullish();
const membersPage = z.object({ members: z.array(z.string()).optional() });

function allowlistKey(channel: string): string {
  return `slack:allowed-users:${channel}`;
}

let writes: Promise<void> = Promise.resolve();
const changesWhileBuilding = new Map<string, boolean>();
let building = false;

function updateAllowlist({
  channel,
  change,
}: {
  channel: string;
  change: (users: Set<string> | undefined) => Set<string> | undefined;
}): Promise<void> {
  const write = writes.then(async () => {
    const state = Chat.getSingleton().getState();
    const stored = storedUsers.parse(await state.get(allowlistKey(channel)));
    const users = change(stored ? new Set(stored) : undefined);
    if (users) {
      await state.set(allowlistKey(channel), [...users]);
    }
  });
  // Ignored here because the caller gets the rejection through `write`; the
  // chain only has to keep running for the next write.
  writes = write.catch(() => undefined);
  return write;
}

export async function optInStatus(userId: string): Promise<OptInStatus> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return 'allowed';
  }
  try {
    const allowedUsers = storedUsers.parse(
      await Chat.getSingleton().getState().get(allowlistKey(channel))
    );
    if (allowedUsers) {
      return allowedUsers.includes(userId) ? 'allowed' : 'not-allowed';
    }
  } catch (error) {
    logger.warn('[allowlist] failed to read opt-in cache', { error, userId });
    return 'unknown';
  }
  return 'list-not-loaded';
}

export async function setMembership({
  allowed,
  userId,
}: {
  allowed: boolean;
  userId: string;
}): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }
  if (building) {
    changesWhileBuilding.set(userId, allowed);
  }
  try {
    await updateAllowlist({
      channel,
      change: (users) => {
        if (allowed) {
          users?.add(userId);
        } else {
          users?.delete(userId);
        }
        return users;
      },
    });
    logger.info(
      allowed ? '[allowlist] user opted in' : '[allowlist] user opted out',
      { channel, userId }
    );
  } catch (error) {
    logger.warn('[allowlist] failed to update opt-in cache', {
      allowed,
      channel,
      error,
      userId,
    });
  }
}

export async function rebuildAllowlist(): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel || building) {
    return;
  }
  building = true;
  changesWhileBuilding.clear();
  try {
    const members = new Set<string>();
    for await (const page of slack.webClient.paginate('conversations.members', {
      channel,
      limit: slackConfig.membersPageSize,
    })) {
      for (const member of membersPage.parse(page).members ?? []) {
        members.add(member);
      }
    }
    await updateAllowlist({
      channel,
      change: () => {
        for (const [userId, allowed] of changesWhileBuilding) {
          if (allowed) {
            members.add(userId);
          } else {
            members.delete(userId);
          }
        }
        return members;
      },
    });
    logger.info('[allowlist] opt-in cache built', { count: members.size });
  } finally {
    building = false;
    changesWhileBuilding.clear();
  }
}

export async function buildAllowlist(): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }

  Chat.getSingleton().onMemberJoinedChannel(async (event) => {
    if (slack.decodeThreadId(event.channelId).channel === channel) {
      await setMembership({ allowed: true, userId: event.userId });
    }
  });
  slack.onMemberLeftChannel(async (event) => {
    if (event.channel === channel) {
      await setMembership({ allowed: false, userId: event.userId });
    }
  });

  try {
    await rebuildAllowlist();
  } catch (error) {
    logger.error('[allowlist] failed to build opt-in cache', {
      channel,
      error,
    });
    throw new Error('Failed to build opt-in allowlist', { cause: error });
  }
}
