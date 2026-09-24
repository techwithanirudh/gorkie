import { eq } from 'drizzle-orm';
import { rawId } from '../../lib/ids';
import {
  type GitHubSettings,
  githubPermissionSchema,
  type ToolDisplayMode,
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

export async function getInstructions(
  userId: string
): Promise<string | undefined> {
  return (await getUserSettings(userId)).instructions;
}

export async function setInstructions({
  userId,
  instructions,
}: {
  userId: string;
  instructions: string | undefined;
}): Promise<void> {
  await updateUserSettings({
    set: { instructions: instructions ?? null },
    userId,
  });
}

export async function getGitHubSettings(
  userId: string
): Promise<GitHubSettings> {
  return (await getUserSettings(userId)).github;
}

export async function setGitHubSettings({
  permission,
  threads,
  userId,
}: GitHubSettings & { userId: string }): Promise<void> {
  await updateUserSettings({
    set: { githubPermission: permission, githubThreads: threads },
    userId,
  });
}

export async function clearGitHubSettings(userId: string): Promise<void> {
  await db
    .update(userSettings)
    .set({ githubPermission: null, githubThreads: null, updatedAt: new Date() })
    .where(eq(userSettings.userId, rawId(userId)));
}

export async function getMCPThreads(userId: string): Promise<boolean> {
  return (await getUserSettings(userId)).mcpThreads;
}

export async function setMCPThreads({
  threads,
  userId,
}: {
  threads: boolean;
  userId: string;
}): Promise<void> {
  await updateUserSettings({ set: { mcpThreads: threads }, userId });
}

export async function getToolDisplay(
  userId: string
): Promise<ToolDisplayMode | undefined> {
  return (await getUserSettings(userId)).toolDisplay;
}

export async function setToolDisplay({
  toolDisplay,
  userId,
}: {
  toolDisplay: ToolDisplayMode;
  userId: string;
}): Promise<void> {
  await updateUserSettings({ set: { toolDisplay }, userId });
}
