import { z } from 'zod';
import { rawId } from '../lib/ids';
import { type UserProfile, userProfileSchema } from '../types';
import { slack } from './client';
import { chat } from './instance';

const profileFieldsSchema = z.record(
  z.string(),
  z.looseObject({ label: z.string().optional(), value: z.string().optional() })
);
const userInfoSchema = z.looseObject({
  user: z
    .looseObject({
      tz: z.string().optional(),
      tz_label: z.string().optional(),
    })
    .optional(),
});

export async function resolveUserProfile(
  id: string
): Promise<UserProfile | undefined> {
  const userId = rawId(id);
  const cacheKey = `slack:user-profile:${userId}`;
  const bot = chat();
  const cached = userProfileSchema.safeParse(
    await bot.getState().get(cacheKey)
  );
  if (cached.success) {
    return cached.data;
  }

  const user = await bot.getUser(userId);
  let profile: UserProfile | undefined;
  try {
    const [{ profile: raw }, rawUser] = await Promise.all([
      slack.webClient.users.profile.get({
        include_labels: true,
        user: userId,
      }),
      slack.webClient.users.info({ user: userId }),
    ]);
    const info = userInfoSchema.parse(rawUser);
    if (!(raw || user)) {
      return;
    }
    const fields = profileFieldsSchema.parse(raw?.fields ?? {});
    profile = {
      displayName: raw?.display_name || undefined,
      fields: Object.values(fields).flatMap((field) =>
        field.value && field.label
          ? [{ label: field.label, value: field.value }]
          : []
      ),
      pronouns: raw?.pronouns || undefined,
      realName: raw?.real_name || undefined,
      status: raw?.status_text || undefined,
      timezone: info.user?.tz || undefined,
      timezoneLabel: info.user?.tz_label || undefined,
      title: raw?.title || undefined,
    };
    // A failed cache write only costs a refetch next time.
    await bot
      .getState()
      .set(cacheKey, profile, 86_400_000)
      .catch(() => undefined);
  } catch {
    // The profile is best effort: fall back to what the Chat SDK knows, cached
    // only briefly so a transient Slack failure is retried soon.
    if (!user) {
      return;
    }
    profile = { fields: [] };
    await bot
      .getState()
      .set(cacheKey, profile, 60_000)
      .catch(() => undefined);
  }

  return {
    ...profile,
    displayName: user?.userName ?? profile.displayName,
    realName: user?.fullName ?? profile.realName,
  };
}
