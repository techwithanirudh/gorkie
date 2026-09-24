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

  // TODO(slopradar): review: performance | bot.getUser goes through SlackAdapter.lookupUser, which calls users.info on a cache miss (dist/index.js:1954), and L30 calls users.info again for tz, so a cold profile costs two users.info calls | drop bot.getUser and take displayName/realName from the users.info result already fetched
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
    // TODO(slopradar): CODING_STANDARDS: no swallowed catch | the profile/info failure is dropped with no log, then an empty profile is cached for failedProfileTtlMs | log it (warn, with userId) before falling back
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
  await bot
    .getState()
    .set(cacheKey, resolved, ttl)
    .catch((error: unknown) => {
      logger.debug('[slack] could not cache user profile', { error, userId });
    });
  return resolved;
}
