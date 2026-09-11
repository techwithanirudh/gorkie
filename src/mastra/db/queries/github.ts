import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { rawId } from '../../lib/ids';
import { db } from '../client';
import { githubCredentials } from '../schema';

export interface GitHubCredential {
  expiresAt: Date | undefined;
  kind: 'app' | 'pat';
  login: string;
  refreshToken: string | undefined;
  scopes: string[];
  token: string;
}

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
    kind: row.kind,
    login: row.login,
    refreshToken: row.refreshToken
      ? decryptSecret(row.refreshToken)
      : undefined,
    scopes: row.scopes ? row.scopes.split(',') : [],
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
    kind: credential.kind,
    login: credential.login,
    refreshToken: credential.refreshToken
      ? encryptSecret(credential.refreshToken)
      : null,
    scopes: credential.scopes.length ? credential.scopes.join(',') : null,
    token: encryptSecret(credential.token),
  };
  await db
    .insert(githubCredentials)
    .values({ ...set, userId: rawId(userId) })
    .onConflictDoUpdate({ target: githubCredentials.userId, set });
}

export async function removeGitHubCredential(userId: string): Promise<void> {
  await db
    .delete(githubCredentials)
    .where(eq(githubCredentials.userId, rawId(userId)));
}
