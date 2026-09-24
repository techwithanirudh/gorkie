import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import { createCodeMode, createCodeModeTool } from '@mastra/core/tools';
import { E2BCodeModeTransport } from '@mastra/e2b';
import { sandbox as sandboxConfig } from '../../config';
import { channelContext } from '../../lib/context';
import { logger } from '../../lib/logger';
import { mcpTools } from '../../mcp';
import { codeModePrompt } from '../../prompts/features/code-mode';
import { codeModeToolNames, requireSandbox } from '../../workspace';
import { workspaceTools } from '../../workspace/tools';
import { canvasTools } from '../canvas';
import { slackTools } from '../slack';

const transport = new E2BCodeModeTransport();

async function getSandboxTools(
  requestContext?: RequestContext
): Promise<ToolsInput> {
  const tools = await workspaceTools(requestContext);
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => codeModeToolNames.has(name))
  );
}

async function createCodeModeInstance({
  mcp,
  workspaceAccess,
}: {
  mcp: Awaited<ReturnType<typeof mcpTools>>;
  workspaceAccess: boolean;
}) {
  const slackCodeTools = {
    ...mcp,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    list_threads: slackTools.list_threads,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    list_channels: slackTools.list_channels,
    get_permalink: slackTools.get_permalink,
    get_slack_file: slackTools.get_slack_file,
    summarize_thread: slackTools.summarize_thread,
    list_canvases: canvasTools.list_canvases,
    read_canvas: canvasTools.read_canvas,
    lookup_canvas_sections: canvasTools.lookup_canvas_sections,
  };
  const tools = workspaceAccess
    ? { ...slackCodeTools, ...(await getSandboxTools()) }
    : slackCodeTools;
  const modeConfig = {
    id: 'slack',
    timeout: sandboxConfig.executionTimeout,
    tools,
  };
  const mode = createCodeMode(modeConfig, transport);

  mode.tool.execute = async (input, context) => {
    if (!context.requestContext) {
      throw new Error('No request context available for Slack code mode.');
    }
    const sandbox = await requireSandbox(context.requestContext);

    const { execute } = createCodeModeTool(
      {
        ...modeConfig,
        sandbox,
        tools: workspaceAccess
          ? {
              ...slackCodeTools,
              ...(await getSandboxTools(context.requestContext)),
            }
          : slackCodeTools,
      },
      transport
    );
    if (!execute) {
      throw new Error('Slack code mode is not executable.');
    }
    const outcome = await execute(input, context);
    const size = JSON.stringify(outcome ?? null)?.length ?? 0;
    const result =
      size <= 60_000
        ? outcome
        : {
            success: false,
            error: {
              message: `The program returned ${size} characters, over the 60000 limit, so nothing was kept. Return a summary computed inside the program (counts, the few records that matter, a written answer) rather than the rows you read, or write the full data to a file and return its path.`,
              name: 'ResultTooLarge',
            },
          };
    if (result?.success === false) {
      // A failed program is returned, not thrown, so the tool span would
      // otherwise end clean and never show up under an ERROR filter.
      const message = result.error?.message ?? 'Code mode program failed.';
      logger.error('[code-mode] program failed', {
        error: result.error,
        logs: result.logs,
        threadId: channelContext(context.requestContext).threadId,
      });
      context.tracingContext?.currentSpan?.error({
        error: new Error(message),
        endSpan: false,
      });
    }
    return result;
  };

  return mode;
}

type CodeModeInstance = Awaited<ReturnType<typeof createCodeModeInstance>>;

const instances = new Map<string, Promise<CodeModeInstance>>();

async function codeMode(workspaceAccess: boolean): Promise<CodeModeInstance> {
  // Code mode calls tool.execute() directly, which skips Mastra's
  // requireApproval check, so only tools the server labels read-only go in.
  const mcp = Object.fromEntries(
    Object.entries(await mcpTools()).filter(
      ([, tool]) => tool.mcp?.annotations?.readOnlyHint === true
    )
  );
  // Keyed on the MCP tool names so an instance built during an MCP outage is replaced once the tools come back.
  const key = `${workspaceAccess ? 'workspace' : 'slack'}:${Object.keys(mcp).sort().join(',')}`;
  const existing = instances.get(key);
  if (existing) {
    return existing;
  }
  const started = createCodeModeInstance({ mcp, workspaceAccess });
  instances.set(key, started);
  return started;
}

export function workspaceCodeMode(): Promise<CodeModeInstance> {
  return codeMode(true);
}

export function slackCodeMode(): Promise<CodeModeInstance> {
  return codeMode(false);
}

export async function workspaceCodeModePrompt(): Promise<string> {
  return codeModePrompt({
    instructions: (await workspaceCodeMode()).instructions,
    files: true,
  });
}

export async function slackCodeModePrompt(): Promise<string> {
  return codeModePrompt({
    instructions: (await slackCodeMode()).instructions,
    files: false,
  });
}
