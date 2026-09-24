import { Chat } from 'chat';
import { env } from '@/env';
// TODO(slopradar): review: architecture | lib/ imports chat/client and wires Chat and Slack channel events in buildAllowlist, so a shared module owns a Slack feature and the dependency points upward | move allowed-users.ts into src/mastra/chat/ next to onboarding.ts, its other writer
import { slack } from '../chat/client';
import type { OptInStatus } from '../types';
import { rawId } from './ids';
import { logger } from './logger';

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
    const stored = await state.get<string[]>(allowlistKey(channel));
    const users = change(stored ? new Set(stored) : undefined);
    if (users) {
      await state.set(allowlistKey(channel), [...users]);
    }
  });
  writes = write.catch(() => undefined);
  return write;
}

export async function optInStatus(userId: string): Promise<OptInStatus> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return 'allowed';
  }
  try {
    const allowedUsers = await Chat.getSingleton()
      .getState()
      .get<string[]>(allowlistKey(channel));
    if (allowedUsers) {
      return allowedUsers.includes(userId) ? 'allowed' : 'not-allowed';
    }
  } catch (error) {
    logger.warn('[allowlist] failed to read opt-in cache', { error, userId });
    return 'unknown';
  }
  return 'uncached';
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
    let cursor: string | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page's cursor comes from the previous response, so this can't be parallelized.
      const response = await slack.webClient.conversations.members({
        channel,
        cursor,
        limit: 200,
      });
      for (const member of response.members ?? []) {
        members.add(member);
      }
      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);
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
    if (rawId(event.channelId) === channel) {
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
