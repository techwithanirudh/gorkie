import type { RequestContext } from '@mastra/core/request-context';
import {
  type GitHubCredential,
  getGitHubCredential,
} from '../../db/queries/github';
import { getGitHubSettings } from '../../db/queries/settings';
import type { GitHubPermission } from '../../types';
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

export function levelsFor(outsideDM: boolean): GitHubPermission[] {
  return outsideDM ? ['all', 'write'] : ['all', 'write', 'never'];
}

async function read({
  isDM,
  userId,
}: {
  isDM: boolean;
  userId: string;
}): Promise<GitHubAccess> {
  let credential: GitHubCredential | undefined;
  let settings: Awaited<ReturnType<typeof getGitHubSettings>>;
  try {
    [credential, settings] = await Promise.all([
      getGitHubCredential(userId),
      getGitHubSettings(userId),
    ]);
  } catch (error) {
    logger.warn('[github] could not read the connection', { error, userId });
    return { state: 'unreadable' };
  }
  if (!credential) {
    return { state: 'disconnected' };
  }

  const direct = isDM || settings.threads;
  return {
    state: 'connected',
    credential,
    direct,
    level: levelsFor(!isDM).includes(settings.permission)
      ? settings.permission
      : 'write',
  };
}

const perRequest = new WeakMap<RequestContext, Promise<GitHubAccess>>();

export function githubAccess({
  isDM,
  requestContext,
  userId,
}: {
  isDM: boolean;
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
