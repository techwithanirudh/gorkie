import { getGitHubCredential } from '../db/queries/github';
import { getGitHubSettings } from '../db/queries/settings';
import { logger } from '../lib/logger';

export async function githubStatusPrompt({
  isDM,
  userId,
}: {
  isDM: boolean;
  userId: string | undefined;
}): Promise<string | undefined> {
  if (!userId) {
    return;
  }
  const [credential, settings] = await Promise.all([
    getGitHubCredential(userId),
    getGitHubSettings(userId),
  ]).catch((error: unknown) => {
    logger.debug('[prompt] could not read the GitHub connection', {
      error,
      userId,
    });
    return [];
  });
  if (!credential) {
    return '<github_status>\nGitHub is not connected for the person asking, so no github_ tool can run. Point them at Home in App Home to sign in.\n</github_status>';
  }

  const where =
    isDM || settings?.threads
      ? undefined
      : 'This is a shared thread, so every github_ tool refuses and hands back a DM to send instead. Call the one you wanted anyway and follow what it returns: research the task, write an implementation plan, DM it to them, and continue the work there.';

  const reach =
    credential.kind === 'pat'
      ? "They connected a classic token, so it reaches whatever their account can, other people's public repositories included. To open a pull request somewhere they cannot push, github_fork_repository, push the branch to the fork, then open the pull request from it."
      : 'They connected the GitHub App, so it reaches only the repositories they installed it on, and forking is not possible from here at all. A push rejected as forbidden means that repository is outside the installation: say so and offer the classic token in App Home, rather than looking for another way through.';

  const body = [
    `GitHub is connected for the person asking, as ${credential.login}. Every github_ tool is already loaded; do not search for one and do not suggest connecting.`,
    where,
    reach,
  ]
    .filter(Boolean)
    .join(' ');

  return `<github_status>\n${body}\n</github_status>`;
}
