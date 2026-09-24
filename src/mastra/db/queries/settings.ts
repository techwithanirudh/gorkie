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

// TODO(slopradar): review: performance + simplification: duplicated shape | getInstructions, getGitHubSettings, getMCPThreads and getToolDisplay each select one column of the same user_settings row; chat/app-home/view.ts:87-114 runs all four per publish and each orchestrator turn runs getInstructions, getMCPThreads and (via githubAccess) getGitHubSettings | one getUserSettings(userId) that reads the row once and returns the parsed fields
export async function getInstructions(
  userId: string
): Promise<string | undefined> {
  const [row] = await db
    .select({ instructions: userSettings.instructions })
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return row?.instructions ?? undefined;
}

// TODO(slopradar): simplification: duplicated logic | the same insert().values().onConflictDoUpdate({ target: userSettings.userId, set }) upsert is copied in setInstructions, setGitHubSettings, setMCPThreads and setToolDisplay | one updateUserSettings({ userId, set }) that stamps updatedAt, called directly by the four callers
export async function setInstructions({
  userId,
  instructions,
}: {
  userId: string;
  instructions: string | undefined;
}): Promise<void> {
  const set = { instructions: instructions ?? null, updatedAt: new Date() };
  await db
    .insert(userSettings)
    .values({ ...set, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}

export async function getGitHubSettings(
  userId: string
): Promise<GitHubSettings> {
  const [row] = await db
    .select({
      permission: userSettings.githubPermission,
      threads: userSettings.githubThreads,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return {
    permission: githubPermissionSchema.parse(row?.permission),
    threads: row?.threads === true,
  };
}

export async function setGitHubSettings({
  permission,
  threads,
  userId,
}: GitHubSettings & { userId: string }): Promise<void> {
  const set = {
    githubPermission: permission,
    githubThreads: threads,
    updatedAt: new Date(),
  };
  await db
    .insert(userSettings)
    .values({ ...set, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}

export async function clearGitHubSettings(userId: string): Promise<void> {
  await db
    .update(userSettings)
    .set({ githubPermission: null, githubThreads: null, updatedAt: new Date() })
    .where(eq(userSettings.userId, rawId(userId)));
}

export async function getMCPThreads(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ threads: userSettings.mcpThreads })
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return row?.threads === true;
}

export async function setMCPThreads({
  threads,
  userId,
}: {
  threads: boolean;
  userId: string;
}): Promise<void> {
  const set = { mcpThreads: threads, updatedAt: new Date() };
  await db
    .insert(userSettings)
    .values({ ...set, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}

export async function getToolDisplay(
  userId: string
): Promise<ToolDisplayMode | undefined> {
  const [row] = await db
    .select({ toolDisplay: userSettings.toolDisplay })
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return toolDisplayModeSchema.safeParse(row?.toolDisplay).data;
}

export async function setToolDisplay({
  toolDisplay,
  userId,
}: {
  toolDisplay: ToolDisplayMode;
  userId: string;
}): Promise<void> {
  const set = { toolDisplay, updatedAt: new Date() };
  await db
    .insert(userSettings)
    .values({ ...set, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}
