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
export async function resolveUserProfile(id: string): Promise<UserProfile> {
  const userId = rawId(id);
  const cacheKey = `slack:user-profile:${userId}`;
  const bot = chat();
  const cached = await bot.getState().get<UserProfile>(cacheKey);
  if (cached) {
    return cached;
  }

  const user = await bot.getUser(userId);
  const [profileResult, infoResult] = await Promise.allSettled([
    slack.webClient.users.profile.get({ include_labels: true, user: userId }),
    slack.webClient.users.info({ user: userId }),
  ]);
  const raw =
    profileResult.status === 'fulfilled'
      ? profileResult.value.profile
      : undefined;
  if (!raw) {
    const cause =
      profileResult.status === 'rejected' ? profileResult.reason : undefined;
    logger.warn('[names] users.profile.get failed', { error: cause, userId });
    throw new Error(
      `Slack profile lookup failed for ${userId}. This says nothing about what the profile contains, so retry before concluding anything.`,
      { cause }
    );
  }
  if (infoResult.status === 'rejected') {
    logger.warn('[names] users.info failed', {
      error: infoResult.reason,
      userId,
    });
  }
  const info =
    infoResult.status === 'fulfilled'
      ? userInfoSchema.parse(infoResult.value)
      : undefined;
  const fields = profileFieldsSchema.parse(raw.fields ?? {});
  const profile: UserProfile = {
    displayName: user?.userName ?? (raw.display_name || undefined),
    fields: Object.values(fields).flatMap((field) =>
      field.value && field.label
        ? [{ label: field.label, value: field.value }]
        : []
    ),
    pronouns: raw.pronouns || undefined,
    realName: user?.fullName ?? (raw.real_name || undefined),
    status: raw.status_text || undefined,
    timezone: info?.user?.tz || undefined,
    timezoneLabel: info?.user?.tz_label || undefined,
    title: raw.title || undefined,
  };
  // A profile without users.info has no timezone, which a day of caching would hide.
  if (info) {
    await bot
      .getState()
      .set(cacheKey, profile, 86_400_000)
      .catch(() => undefined);
  }
  return profile;
}
