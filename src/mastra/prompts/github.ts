import type { RequestContext } from '@mastra/core/request-context';
import { githubAccess } from '../lib/github';

export async function githubStatusPrompt({
  isDM,
  requestContext,
  userId,
}: {
  isDM: boolean;
  requestContext?: RequestContext;
  userId: string | undefined;
}): Promise<string | undefined> {
  if (!userId) {
    return;
  }
  const access = await githubAccess({ isDM, requestContext, userId });
  if (access.state === 'unreadable') {
    return '<github_status>\nWhether GitHub is connected could not be checked just now, and the github_ tools are missing for the same reason. Say the connection could not be checked and that they should try again shortly. Do not tell them to connect: they may already be.\n</github_status>';
  }
  if (access.state === 'disconnected') {
    return '<github_status>\nGitHub is not connected for the person asking, so no github_ tool can run. Point them at Home in App Home to sign in.\n</github_status>';
  }

  return `<github_status>\nGitHub is connected for the person asking, as ${access.credential.login}. Every github_ tool is already loaded; do not search for one and do not suggest connecting. A tool that refuses explains why and what to do instead, so follow what it hands back rather than looking for another way through.\n</github_status>`;
}
