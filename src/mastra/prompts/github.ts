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
    getGitHubCredential(userId).catch((error: unknown) => {
      logger.debug('[prompt] could not read the GitHub credential', {
        error,
        userId,
      });
    }),
    getGitHubSettings(userId).catch(() => ({ threads: false })),
  ]);
  if (!credential) {
    return '<github_status>\nGitHub is not connected for the person asking, so no github_ tool can run. Point them at Home in App Home to sign in.\n</github_status>';
  }

  const where =
    isDM || settings.threads
      ? 'The github_ tools run here normally, so use them. Do not offer to move to a DM and do not say a thread stops you.'
      : 'This is a shared thread, so every github_ tool refuses and hands back a DM to send instead. Call the one you wanted anyway and follow what it returns: research the task, write an implementation plan, DM it to them, and continue the work there.';

  return `<github_status>\nGitHub is connected for the person asking, as ${credential.login}. Every github_ tool is already loaded; do not search for one and do not suggest connecting. ${where}\n</github_status>`;
}
