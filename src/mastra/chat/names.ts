import { Chat } from 'chat';
import { z } from 'zod';
import { slack as slackConfig } from '../config';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import { slack } from './client';

const userProfileSchema = z.object({
  displayName: z.string().optional(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  pronouns: z.string().optional(),
  realName: z.string().optional(),
  status: z.string().optional(),
  timezone: z.string().optional(),
  timezoneLabel: z.string().optional(),
  title: z.string().optional(),
});

type UserProfile = z.infer<typeof userProfileSchema>;

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
    if (!(raw || info)) {
      return;
    }
    profile = {
      displayName:
        info?.profile?.display_name ||
        info?.profile?.real_name ||
        info?.real_name ||
        info?.name ||
        raw?.display_name ||
        undefined,
      fields: Object.values(raw?.fields ?? {}).flatMap((field) =>
        field.value && field.label
          ? [{ label: field.label, value: field.value }]
          : []
      ),
      pronouns: raw?.pronouns || undefined,
      realName:
        info?.real_name ||
        info?.profile?.real_name ||
        raw?.real_name ||
        undefined,
      status: raw?.status_text || undefined,
      timezone: info?.tz || undefined,
      timezoneLabel: info?.tz_label || undefined,
      title: raw?.title || undefined,
    };
  } catch (error) {
    logger.warn('[slack] could not fetch the user profile', { error, userId });
    // Chat SDK's user lookup is cached, so it can still name the person.
    const user = await bot.getUser(userId);
    if (!user) {
      return;
    }
    profile = {
      displayName: user.userName,
      fields: [],
      realName: user.fullName,
    };
    ttl = slackConfig.failedProfileTtlMs;
  }

  await bot
    .getState()
    .set(cacheKey, profile, ttl)
    .catch((error: unknown) => {
      logger.debug('[slack] could not cache user profile', { error, userId });
    });
  return profile;
}
