import { rawId } from '../../lib/ids';
import { type GitHubPermission, githubPermissionSchema } from '../../types';
import { db } from '../client';

export async function getInstructions(
  userId: string
): Promise<string | undefined> {
  const row = await db
    .selectFrom('user_settings')
    .select('instructions')
    .where('user_id', '=', rawId(userId))
    .executeTakeFirst();
  return row?.instructions ?? undefined;
}

export async function setInstructions({
  userId,
  instructions,
}: {
  userId: string;
  instructions: string | undefined;
}): Promise<void> {
  const id = rawId(userId);
  const value = instructions ?? null;
  const now = new Date();
  await db
    .insertInto('user_settings')
    .values({ instructions: value, updated_at: now, user_id: id })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({ instructions: value, updated_at: now })
    )
    .execute();
}

interface GitHubSettings {
  permission: GitHubPermission;
  threads: boolean;
}

export async function getGitHubSettings(
  userId: string
): Promise<GitHubSettings> {
  const row = await db
    .selectFrom('user_settings')
    .select(['github_permission', 'github_threads'])
    .where('user_id', '=', rawId(userId))
    .executeTakeFirst();
  return {
    permission: githubPermissionSchema.parse(row?.github_permission),
    threads: row?.github_threads === true,
  };
}

export async function setGitHubSettings({
  permission,
  threads,
  userId,
}: GitHubSettings & { userId: string }): Promise<void> {
  const id = rawId(userId);
  const now = new Date();
  await db
    .insertInto('user_settings')
    .values({
      instructions: null,
      github_permission: permission,
      github_threads: threads,
      updated_at: now,
      user_id: id,
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        github_permission: permission,
        github_threads: threads,
        updated_at: now,
      })
    )
    .execute();
}

export async function clearGitHubSettings(userId: string): Promise<void> {
  await db
    .updateTable('user_settings')
    .set({
      github_permission: null,
      github_threads: null,
      updated_at: new Date(),
    })
    .where('user_id', '=', rawId(userId))
    .execute();
}
