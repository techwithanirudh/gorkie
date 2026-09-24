import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { rawId } from '../../lib/ids';
import type { GitHubCredential } from '../../types';
import { db } from '../client';
import { githubCredentials } from '../schema';

export async function getGitHubCredential(
  userId: string
): Promise<GitHubCredential | undefined> {
  const [row] = await db
    .select()
    .from(githubCredentials)
    .where(eq(githubCredentials.userId, rawId(userId)));
  if (!row) {
    return;
  }
  return {
    expiresAt: row.expiresAt ?? undefined,
    login: row.login,
    refreshToken: row.refreshToken
      ? decryptSecret(row.refreshToken)
      : undefined,
    token: decryptSecret(row.token),
  };
}

export async function setGitHubCredential({
  credential,
  userId,
}: {
  credential: GitHubCredential;
  userId: string;
}): Promise<void> {
  const set = {
    expiresAt: credential.expiresAt ?? null,
    login: credential.login,
    refreshToken: credential.refreshToken
      ? encryptSecret(credential.refreshToken)
      : null,
    token: encryptSecret(credential.token),
  };
  await db
    .insert(githubCredentials)
    .values({ ...set, userId: rawId(userId) })
    .onConflictDoUpdate({ target: githubCredentials.userId, set });
}

export async function updateRefreshedGitHubCredential({
  credential,
  userId,
}: {
  credential: Pick<GitHubCredential, 'expiresAt' | 'refreshToken' | 'token'>;
  userId: string;
}): Promise<boolean> {
  const updated = await db
    .update(githubCredentials)
    .set({
      expiresAt: credential.expiresAt ?? null,
      refreshToken: credential.refreshToken
        ? encryptSecret(credential.refreshToken)
        : null,
      token: encryptSecret(credential.token),
    })
    .where(eq(githubCredentials.userId, rawId(userId)))
    .returning({ userId: githubCredentials.userId });
  return updated.length > 0;
}

export async function removeGitHubCredential(userId: string): Promise<void> {
  await db
    .delete(githubCredentials)
    .where(eq(githubCredentials.userId, rawId(userId)));
}
