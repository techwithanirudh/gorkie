import { eq } from 'drizzle-orm';
import { type GitHubSettings, githubPermissionSchema } from '../../types';
import { db } from '../client';
import { userSettings } from '../schema';

export async function getUserSettings(userId: string) {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return {
    instructions: row?.instructions ?? undefined,
    github: {
      permission: githubPermissionSchema.parse(row?.githubPermission),
      threads: row?.githubThreads === true,
    } satisfies GitHubSettings,
    // TODO(slopradar): unvalidated read : toolDisplay trusts the schema's $type cast while githubPermission above is Zod-parsed
    // → parse with toolDisplayModeSchema (optional, catch undefined).
    toolDisplay: row?.toolDisplay ?? undefined,
  };
}

export async function updateUserSettings({
  set,
  userId,
}: {
  set: Omit<typeof userSettings.$inferInsert, 'userId' | 'updatedAt'>;
  userId: string;
}): Promise<void> {
  const stamped = { ...set, updatedAt: new Date() };
  await db
    .insert(userSettings)
    .values({ ...stamped, userId })
    .onConflictDoUpdate({ target: userSettings.userId, set: stamped });
}

export async function clearGitHubSettings(userId: string): Promise<void> {
  await db
    .update(userSettings)
    .set({ githubPermission: null, githubThreads: null, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}
