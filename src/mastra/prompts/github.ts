import type { RequestContext } from '@mastra/core/request-context';
import { githubAccess } from '../lib/github';

export async function githubPrompt({
  isDM,
  requestContext,
  userId,
}: {
  isDM: boolean;
  requestContext: RequestContext;
  userId: string | undefined;
}): Promise<string | undefined> {
  if (!userId) {
    return;
  }
  const access = await githubAccess({ requestContext, userId });
  if (access.state === 'unreadable') {
    return '<github>\nWhether GitHub is connected could not be checked just now, and the github_ tools are missing for the same reason. Say the connection could not be checked and that they should try again shortly. Do not tell them to connect: they may already be.\n</github>';
  }
  if (access.state === 'disconnected') {
    return '<github>\nGitHub is not connected for the person asking, so no github_ tool can run. Point them at Home in App Home to sign in.\n</github>';
  }

  const lines = [
    `GitHub is connected for the person asking, as ${access.credential.login}. Do not suggest connecting.`,
    'The github_ tools load through search_tools: search for what you need (for example "github pull request" or "github checkout") before the first call. Older turns get compressed and unload them, so search again when one you used earlier is no longer in your tool list.',
    isDM
      ? 'Push with github_push_branch in the same turn as the commit, right after it. The sandbox pauses when a turn ends and can be collected, so a commit that was never pushed can be lost.'
      : 'This is a shared thread, so every github_ tool here returns the DM handoff instead of running. Follow it.',
    'A tool that refuses explains why and what to do instead, so follow what it hands back rather than looking for another way through.',
  ];
  if (access.credential.lastError) {
    lines.push(
      `The last GitHub call failed: ${access.credential.lastError} If a github_ call fails on authentication, tell them to reconnect from the Home tab.`
    );
  }
  return `<github>\n${lines.join('\n')}\n</github>`;
}
