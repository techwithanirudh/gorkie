import {
  countInstallations,
  githubAccessToken,
  recordGitHubUnauthorized,
} from '../../../lib/github';
import type { GitHubCredential } from '../../../types';

export async function githubInstallations({
  credential,
  userId,
}: {
  credential: GitHubCredential | undefined;
  userId: string;
}): Promise<number> {
  const token =
    credential && !credential.lastError
      ? await githubAccessToken(userId)
      : undefined;
  if (!token) {
    return 0;
  }
  const installations = await countInstallations(token);
  if ('count' in installations) {
    return installations.count;
  }
  if (installations.status === 401) {
    await recordGitHubUnauthorized(userId);
  }
  return 0;
}
