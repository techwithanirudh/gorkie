import type { RequestContext } from '@mastra/core/request-context';
import { getGitHubCredential } from '../../db/queries/github';
import { getGitHubSettings } from '../../db/queries/settings';
import type { GitHubCredential, GitHubPermission } from '../../types';
import { levelOutsideDM } from '../approval';
import { logger } from '../logger';

type GitHubAccess =
  | { state: 'unreadable' }
  | { state: 'disconnected' }
  | {
      state: 'connected';
      credential: GitHubCredential;
      direct: boolean;
      level: GitHubPermission;
    };

async function read({
  isDM,
  userId,
}: {
  isDM: boolean;
  userId: string;
}): Promise<GitHubAccess> {
  try {
    const [credential, settings] = await Promise.all([
      getGitHubCredential(userId),
      getGitHubSettings(userId),
    ]);
    if (!credential) {
      return { state: 'disconnected' };
    }
    return {
      state: 'connected',
      credential,
      direct: isDM || settings.threads,
      level: levelOutsideDM({ isDM, level: settings.permission }),
    };
  } catch (error) {
    logger.warn('[github] could not read the connection', { error, userId });
    return { state: 'unreadable' };
  }
}

const perRequest = new WeakMap<RequestContext, Promise<GitHubAccess>>();

// `isDM` left out reads as a shared thread, the narrower of the two.
export function githubAccess({
  isDM = false,
  requestContext,
  userId,
}: {
  isDM?: boolean;
  requestContext?: RequestContext;
  userId: string;
}): Promise<GitHubAccess> {
  if (!requestContext) {
    return read({ isDM, userId });
  }
  const cached = perRequest.get(requestContext);
  if (cached) {
    return cached;
  }
  const started = read({ isDM, userId });
  perRequest.set(requestContext, started);
  return started;
}
