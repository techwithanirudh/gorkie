import { eq } from 'drizzle-orm';
import { rawId } from '../../lib/ids';
import {
  type GitHubSettings,
  githubPermissionSchema,
  toolDisplayModeSchema,
} from '../../types';
import { db } from '../client';
import { userSettings } from '../schema';

export async function getUserSettings(userId: string) {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return {
    instructions: row?.instructions ?? undefined,
    github: {
      permission: githubPermissionSchema.parse(row?.githubPermission),
      threads: row?.githubThreads === true,
    } satisfies GitHubSettings,
    mcpThreads: row?.mcpThreads === true,
    toolDisplay: toolDisplayModeSchema.safeParse(row?.toolDisplay).data,
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
    .values({ ...stamped, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set: stamped });
}

export async function clearGitHubSettings(userId: string): Promise<void> {
  await db
    .update(userSettings)
    .set({ githubPermission: null, githubThreads: null, updatedAt: new Date() })
    .where(eq(userSettings.userId, rawId(userId)));
}
