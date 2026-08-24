import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import { createCodeMode, createCodeModeTool } from '@mastra/core/tools';
import { E2BCodeModeTransport } from '@mastra/e2b';
import { sandbox as sandboxConfig } from '../../config';
import { mcpTools } from '../../mcp';
import { codeModePrompt } from '../../prompts/features/code-mode';
import { codeModeToolNames, getSandbox } from '../../workspace';
import { workspaceTools } from '../../workspace/tools';
import { canvasTools } from '../canvas';
import { grepTool } from '../grep';
import { slackTools } from '../slack';

const transport = new E2BCodeModeTransport();

const slackCodeTools = {
  ...mcpTools,
  search_slack: slackTools.search_slack,
  read_conversation_history: slackTools.read_conversation_history,
  list_threads: slackTools.list_threads,
  get_user: slackTools.get_user,
  get_channel_info: slackTools.get_channel_info,
  list_channels: slackTools.list_channels,
  get_permalink: slackTools.get_permalink,
  get_slack_file: slackTools.get_slack_file,
  summarize_thread: slackTools.summarize_thread,
  call_slack_api: slackTools.call_slack_api,
  list_canvases: canvasTools.list_canvases,
  read_canvas: canvasTools.read_canvas,
  lookup_canvas_sections: canvasTools.lookup_canvas_sections,
};

async function getSandboxTools(
  requestContext?: RequestContext
): Promise<ToolsInput> {
  const tools = await workspaceTools(requestContext);
  return {
    ...Object.fromEntries(
      Object.entries(tools).filter(([name]) => codeModeToolNames.has(name))
    ),
    grep: grepTool,
  };
}

const RESULT_LIMIT = 60_000;

function capResult(outcome: unknown): unknown {
  const size = JSON.stringify(outcome ?? null)?.length ?? 0;
  if (size <= RESULT_LIMIT) {
    return outcome;
  }
  return {
    success: false,
    error: {
      message: `The program returned ${size} characters, over the ${RESULT_LIMIT} limit, so nothing was kept. Return a summary computed inside the program (counts, the few records that matter, a written answer) rather than the rows you read, or write the full data to a file and return its path.`,
      name: 'ResultTooLarge',
    },
  };
}

async function createCodeModeInstance({
  workspaceAccess,
}: {
  workspaceAccess: boolean;
}) {
  const tools = workspaceAccess
    ? { ...slackCodeTools, ...(await getSandboxTools()) }
    : slackCodeTools;
  const modeConfig = { id: 'slack', timeout: sandboxConfig.timeout, tools };
  const mode = createCodeMode(modeConfig, transport);

  mode.tool.execute = async (input, context) => {
    if (!context.requestContext) {
      throw new Error('No request context available for Slack code mode.');
    }
    const sandbox = await getSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No E2B sandbox available for Slack code mode.');
    }

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
    return capResult(await execute(input, context));
  };

  return mode;
}

export const workspaceCodeMode = await createCodeModeInstance({
  workspaceAccess: true,
});
export const workspaceCodeModePrompt = codeModePrompt({
  instructions: workspaceCodeMode.instructions,
  files: true,
});

export const slackCodeMode = await createCodeModeInstance({
  workspaceAccess: false,
});
export const slackCodeModePrompt = codeModePrompt({
  instructions: slackCodeMode.instructions,
  files: false,
});
