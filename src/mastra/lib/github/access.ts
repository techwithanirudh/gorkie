import type { RequestContext } from '@mastra/core/request-context';
import { getGitHubCredential } from '../../db/queries/github';
import { getGitHubPermission } from '../../db/queries/settings';
import type { GitHubCredential, GitHubPermission } from '../../types';
import { logger } from '../logger';

type GitHubAccess =
  | { state: 'unreadable' }
  | { state: 'disconnected' }
  | {
      state: 'connected';
      credential: GitHubCredential;
      level: GitHubPermission;
    };

async function read(userId: string): Promise<GitHubAccess> {
  try {
    const [credential, level] = await Promise.all([
      getGitHubCredential(userId),
      getGitHubPermission(userId),
    ]);
    if (!credential) {
      return { state: 'disconnected' };
    }
    return { state: 'connected', credential, level };
  } catch (error) {
    logger.warn('[github] could not read the connection', { error, userId });
    return { state: 'unreadable' };
  }
}

const perRequest = new WeakMap<RequestContext, Promise<GitHubAccess>>();

export function githubAccess({
  requestContext,
  userId,
}: {
  requestContext?: RequestContext;
  userId: string;
}): Promise<GitHubAccess> {
  if (!requestContext) {
    return read(userId);
  }
  const cached = perRequest.get(requestContext);
  if (cached) {
    return cached;
  }
  const started = read(userId);
  perRequest.set(requestContext, started);
  return started;
}
