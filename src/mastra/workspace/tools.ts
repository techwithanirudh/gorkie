import type { RequestContext } from '@mastra/core/request-context';
import { createWorkspaceTools } from '@mastra/core/workspace';
import { describeWorkSchema } from '../tools/work-description';
import { workspace } from './index';
import { EXECUTE_COMMAND } from './tool-names';

type WorkspaceTools = Awaited<ReturnType<typeof createWorkspaceTools>>;

async function describedTools(requestContext?: RequestContext) {
  const tools = await createWorkspaceTools(workspace, {
    workspace,
    requestContext,
  });
  const command = tools[EXECUTE_COMMAND];
  if (command) {
    command.inputSchema = describeWorkSchema(command.inputSchema);
  }
  return tools;
}

const byRequest = new WeakMap<RequestContext, Promise<WorkspaceTools>>();

export function workspaceTools(
  requestContext?: RequestContext
): Promise<WorkspaceTools> {
  if (!requestContext) {
    return describedTools();
  }
  const cached = byRequest.get(requestContext);
  if (cached) {
    return cached;
  }
  const created = describedTools(requestContext);
  byRequest.set(requestContext, created);
  return created;
}
