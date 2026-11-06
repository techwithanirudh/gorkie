import { z } from 'zod';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import type { UserProfile } from '../types';
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
  const cached = await bot.getState().get<UserProfile>(cacheKey);
  if (cached) {
    return cached;
  }

  const user = await bot.getUser(userId);
  const [{ profile: raw }, rawUser] = await Promise.all([
    slack.webClient.users.profile.get({
      include_labels: true,
      user: userId,
    }),
    slack.webClient.users.info({ user: userId }),
  ]).catch((err: unknown) => {
    logger.warn('[names] failed to read Slack profile', { err, userId });
    throw new Error(
      `Could not read the Slack profile for ${userId}. This says nothing about the person's pronouns or other fields. Retry before reporting them.`
    );
  });
  const info = userInfoSchema.parse(rawUser);
  if (!(raw || user)) {
    return;
  }
  const fields = profileFieldsSchema.parse(raw?.fields ?? {});
  const profile: UserProfile = {
    displayName: user?.userName ?? (raw?.display_name || undefined),
    fields: Object.values(fields).flatMap((field) =>
      field.value && field.label
        ? [{ label: field.label, value: field.value }]
        : []
    ),
    pronouns: raw?.pronouns || undefined,
    realName: user?.fullName ?? (raw?.real_name || undefined),
    status: raw?.status_text || undefined,
    timezone: info.user?.tz || undefined,
    timezoneLabel: info.user?.tz_label || undefined,
    title: raw?.title || undefined,
  };
  await bot
    .getState()
    .set(cacheKey, profile, 86_400_000)
    .catch(() => undefined);
  return profile;
}
