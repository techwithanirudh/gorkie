import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { rawId } from '../../lib/ids';
import { db } from '../client';

type GitHubCredentialKind = 'app' | 'pat';

export interface GitHubCredential {
  expiresAt: Date | undefined;
  kind: GitHubCredentialKind;
  login: string;
  refreshToken: string | undefined;
  scopes: string[];
  token: string;
}

interface Row {
  expires_at: Date | null;
  kind: string;
  login: string;
  refresh_token: string | null;
  scopes: string | null;
  token: string;
}

function toCredential(row: Row): GitHubCredential {
  return {
    expiresAt: row.expires_at ?? undefined,
    kind: row.kind === 'pat' ? 'pat' : 'app',
    login: row.login,
    refreshToken: row.refresh_token
      ? decryptSecret(row.refresh_token)
      : undefined,
    scopes: row.scopes ? row.scopes.split(',') : [],
    token: decryptSecret(row.token),
  };
}

export async function getGitHubCredential(
  userId: string
): Promise<GitHubCredential | undefined> {
  const row = await db
    .selectFrom('github_credentials')
    .selectAll()
    .where('user_id', '=', rawId(userId))
    .executeTakeFirst();
  return row ? toCredential(row) : undefined;
}

export async function setGitHubCredential({
  credential,
  userId,
}: {
  credential: GitHubCredential;
  userId: string;
}): Promise<void> {
  const id = rawId(userId);
  await db.transaction().execute(async (tx) => {
    await tx
      .deleteFrom('github_credentials')
      .where('user_id', '=', id)
      .execute();
    await tx
      .insertInto('github_credentials')
      .values({
        expires_at: credential.expiresAt ?? null,
        kind: credential.kind,
        login: credential.login,
        refresh_token: credential.refreshToken
          ? encryptSecret(credential.refreshToken)
          : null,
        scopes: credential.scopes.length ? credential.scopes.join(',') : null,
        token: encryptSecret(credential.token),
        user_id: id,
      })
      .execute();
  });
}

export async function removeGitHubCredential(userId: string): Promise<void> {
  await db
    .deleteFrom('github_credentials')
    .where('user_id', '=', rawId(userId))
    .execute();
}
