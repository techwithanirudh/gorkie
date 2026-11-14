import type {
  ProcessOutputResultArgs,
  ProcessToolResultArgs,
} from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { getMastra } from '../chat/mastra-instance';
import { sandbox as sandboxConfig } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { memoryThread } from '../lib/memory';
import {
  getSandbox,
  pauseSandbox,
  usedSandbox,
  workspaceToolNames,
} from '../workspace';
import { runningJobs } from '../workspace/jobs';

async function hasRunningBackgroundTask(
  requestContext: RequestContext
): Promise<boolean> {
  const { threadId } = channelContext(requestContext);
  const manager = getMastra().backgroundTaskManager;
  if (!(threadId && manager)) {
    return false;
  }
  try {
    const { default: orchestrator } = await import('../agents/orchestrator');
    const thread = await memoryThread({
      agent: orchestrator,
      externalThreadId: threadId,
    });
    if (!thread) {
      return false;
    }
    const { tasks } = await manager.listTasks({
      status: ['pending', 'running'],
      threadId: thread.id,
    });
    return tasks.length > 0;
  } catch (error) {
    logger.warn('[sandbox] could not check background tasks', { error });
    return true;
  }
}

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description:
    'Extends sandbox lifetime during active tool use, then pauses it once the turn finishes.',
  async processToolResult(args: ProcessToolResultArgs) {
    const { requestContext, toolName } = args;
    if (!requestContext) {
      return;
    }
    if (!(usedSandbox(requestContext) || workspaceToolNames.has(toolName))) {
      return;
    }
    try {
      const sandbox = await getSandbox(requestContext);
      await sandbox?.retryOnDead(() =>
        sandbox.e2b.setTimeout(sandboxConfig.timeout)
      );
    } catch (error) {
      logger.debug('[sandbox] failed to extend lifetime', { error });
    }
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (
      requestContext &&
      runningJobs(channelContext(requestContext).threadId) === 0 &&
      !(await hasRunningBackgroundTask(requestContext))
    ) {
      await pauseSandbox(requestContext);
    }
    return messages;
  },
};
