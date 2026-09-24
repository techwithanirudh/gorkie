import { eq } from 'drizzle-orm';
import { rawId } from '../../lib/ids';
import {
  type GitHubPermission,
  githubPermissionSchema,
  type ToolDisplayMode,
  toolDisplayModeSchema,
} from '../../types';
import { db } from '../client';
import { userSettings } from '../schema';

export async function getInstructions(
  userId: string
): Promise<string | undefined> {
  const [row] = await db
    .select({ instructions: userSettings.instructions })
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return row?.instructions ?? undefined;
}

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

export async function getGitHubPermission(
  userId: string
): Promise<GitHubPermission> {
  const [row] = await db
    .select({ permission: userSettings.githubPermission })
    .from(userSettings)
    .where(eq(userSettings.userId, rawId(userId)));
  return githubPermissionSchema.parse(row?.permission);
}

export async function setGitHubPermission({
  permission,
  userId,
}: {
  permission: GitHubPermission;
  userId: string;
}): Promise<void> {
  const set = { githubPermission: permission, updatedAt: new Date() };
  await db
    .insert(userSettings)
    .values({ ...set, instructions: null, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}

export async function clearGitHubPermission(userId: string): Promise<void> {
  await db
    .update(userSettings)
    .set({ githubPermission: null, updatedAt: new Date() })
    .where(eq(userSettings.userId, rawId(userId)));
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
    .values({ ...set, instructions: null, userId: rawId(userId) })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}
