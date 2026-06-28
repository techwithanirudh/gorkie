import { z } from 'zod';
import type { UserProfile } from '../types';
import { slack } from './client';
import { chat } from './instance';

const profileFields = z.record(
  z.string(),
  z.looseObject({ label: z.string().optional(), value: z.string().optional() })
);
const DAY_MS = 86_400_000;

function rawUserId(id: string): string {
  return id.replace(/^slack:/, '').split(':')[0] ?? id;
}

export async function resolveUserProfile(
  id: string
): Promise<UserProfile | undefined> {
  const userId = rawUserId(id);
  const key = `slack:user-profile:${userId}`;
  const bot = chat();
  const [user, cached] = await Promise.all([
    bot.getUser(userId),
    bot.getState().get<UserProfile>(key),
  ]);

  let profile = cached ?? undefined;
  if (!profile) {
    try {
      const { profile: raw } = await slack.webClient.users.profile.get({
        include_labels: true,
        user: userId,
      });
      if (!(raw || user)) {
        return;
      }
      const fields = profileFields.parse(raw?.fields ?? {});
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
        title: raw?.title || undefined,
      };
      await bot
        .getState()
        .set(key, profile, DAY_MS)
        .catch(() => undefined);
    } catch {
      if (!user) {
        return;
      }
      profile = { fields: [] };
    }
  }

  return {
    ...profile,
    displayName: user?.userName ?? profile.displayName,
    realName: user?.fullName ?? profile.realName,
  };
}
