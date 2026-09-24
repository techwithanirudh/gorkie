import { Chat } from 'chat';
import { slack as slackConfig } from '../config';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import { type UserProfile, userProfileSchema } from '../types';
import { slack } from './client';

export async function resolveUserProfile(
  id: string
): Promise<UserProfile | undefined> {
  const userId = rawId(id);
  const cacheKey = `slack:user-profile:${userId}`;
  const bot = Chat.getSingleton();
  const cached = userProfileSchema.safeParse(
    await bot.getState().get(cacheKey)
  );
  if (cached.success) {
    return cached.data;
  }

  const user = await bot.getUser(userId);
  let profile: UserProfile;
  let ttl = slackConfig.profileTtlMs;
  try {
    const [{ profile: raw }, { user: info }] = await Promise.all([
      slack.webClient.users.profile.get({
        include_labels: true,
        user: userId,
      }),
      slack.webClient.users.info({ user: userId }),
    ]);
    if (!(raw || user)) {
      return;
    }
    profile = {
      displayName: raw?.display_name || undefined,
      fields: Object.values(raw?.fields ?? {}).flatMap((field) =>
        field.value && field.label
          ? [{ label: field.label, value: field.value }]
          : []
      ),
      pronouns: raw?.pronouns || undefined,
      realName: raw?.real_name || undefined,
      status: raw?.status_text || undefined,
      timezone: info?.tz || undefined,
      timezoneLabel: info?.tz_label || undefined,
      title: raw?.title || undefined,
    };
  } catch {
    if (!user) {
      return;
    }
    profile = { fields: [] };
    ttl = slackConfig.failedProfileTtlMs;
  }

  const resolved = {
    ...profile,
    displayName: user?.userName ?? profile.displayName,
    realName: user?.fullName ?? profile.realName,
  };
  // A failed cache write only costs a refetch next time.
  await bot
    .getState()
    .set(cacheKey, resolved, ttl)
    .catch((error: unknown) => {
      logger.debug('[slack] could not cache user profile', { error, userId });
    });
  return resolved;
}
