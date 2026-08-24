import type { RequestContext } from '@mastra/core/request-context';
import { createWorkspaceTools } from '@mastra/core/workspace';
import { workspace } from './index';

type WorkspaceTools = Awaited<ReturnType<typeof createWorkspaceTools>>;
const byRequest = new WeakMap<RequestContext, Promise<WorkspaceTools>>();

export function workspaceTools(
  requestContext?: RequestContext
): Promise<WorkspaceTools> {
  if (!requestContext) {
    return createWorkspaceTools(workspace, { workspace });
  }
  const cached = byRequest.get(requestContext);
  if (cached) {
    return cached;
  }
  const created = createWorkspaceTools(workspace, {
    workspace,
    requestContext,
  });
  byRequest.set(requestContext, created);
  return created;
}
