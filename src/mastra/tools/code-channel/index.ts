import { cardToBlockKit } from '@chat-adapter/slack';
import { createTool, type ToolExecutionContext } from '@mastra/core/tools';
import { Card, CardText } from 'chat';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { codeChannels } from '../../config';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import {
  codeChannelSchema,
  codeCommandsInputSchema,
  codePropertiesInputSchema,
  codeViewInputSchema,
} from '../../types/tools/code-channel';
import { slackErrorSchema } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { confinePath } from '../../workspace/filesystem';
import { spendSlackCall } from '../slack/budget';

async function currentCodeChannel(
  context: ToolExecutionContext
): Promise<string> {
  context.abortSignal?.throwIfAborted();
  const ctx = channelContext(context.requestContext);
  const { channel } = parseSlackInput(ctx.channelId ?? ctx.threadId);
  if (!(channel && ctx.userId)) {
    throw new Error('No current Slack channel.');
  }
  spendSlackCall(context.requestContext);
  const response = await slack.webClient.conversations.info({ channel });
  const parsed = codeChannelSchema.safeParse(response.channel);
  if (!parsed.success) {
    throw new Error('This conversation is not a Slack code channel.');
  }
  const agents =
    parsed.data.properties.agent_session?.encoded_agent_bot_user_ids;
  if (!(slack.botUserId && agents?.includes(slack.botUserId))) {
    throw new Error('Gorkie is not an assigned agent for this code channel.');
  }
  context.abortSignal?.throwIfAborted();
  return channel;
}

export const createCodeChannelTool = createTool({
  id: 'create_code_channel',
  description:
    'Open a dedicated Slack code channel only when the user asks for one. Links the current message as its origin and preserves its privacy. Retries for that origin return the same channel. Return the channel link so the user can continue there; this does not move the running turn or its sandbox.',
  inputSchema: z.strictObject({ name: z.string().trim().min(1) }),
  outputSchema: z.strictObject({ channelId: z.string() }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Opened code channel: ${input?.name}`,
      }),
    },
  },
  execute: async ({ name }, context) => {
    context.abortSignal?.throwIfAborted();
    const ctx = channelContext(context.requestContext);
    const { channel } = parseSlackInput(ctx.channelId ?? ctx.threadId);
    if (!(channel && ctx.messageId && ctx.userId)) {
      throw new Error('A Slack message is required to open a code channel.');
    }
    spendSlackCall(context.requestContext);
    let response: unknown;
    try {
      response = await slack.webClient.apiCall('agents.conversations.create', {
        name,
        session_id: `gorkie:${channel}:${ctx.messageId}`,
        origin_channel_id: channel,
        origin_message_ts: ctx.messageId,
      });
    } catch (error) {
      const slackError = slackErrorSchema.safeParse(error).data?.data?.error;
      if (
        slackError === 'feature_disabled' ||
        slackError === 'missing_scope' ||
        slackError === 'not_agent'
      ) {
        throw new Error(
          'Slack code channels are not enabled for the installed gorkie app. Apply slack-manifest.dev.json to the gorkie (dev) app and reinstall it so code_channels:manage is granted, then try again.',
          { cause: error }
        );
      }
      throw error;
    }
    const result = z.object({ channel_id: z.string().min(1) }).parse(response);
    return { channelId: `slack:${result.channel_id}` };
  },
});

async function publishView(
  input: z.infer<typeof codeViewInputSchema>,
  context: ToolExecutionContext
) {
  const channel = await currentCodeChannel(context);
  if (!context.requestContext) {
    throw new Error('No request context for a sandbox view.');
  }
  let args: Record<string, unknown>;
  switch (input.type) {
    case 'html':
    case 'diff': {
      const path = confinePath({ inputPath: input.path });
      const sandbox = await requireSandbox(context.requestContext);
      const stat = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.getInfo(path)
      );
      if (stat.size > codeChannels.maxViewBytes) {
        throw new Error(
          'Slack code-channel views are limited to 1,000,000 bytes.'
        );
      }
      const content = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.read(path)
      );
      if (Buffer.byteLength(content) > codeChannels.maxViewBytes) {
        throw new Error(
          'Slack code-channel views are limited to 1,000,000 bytes.'
        );
      }
      args =
        input.type === 'html'
          ? {
              content,
              view_key: input.viewKey,
              name: input.name,
              ...(input.resourceDomains
                ? { csp: { resource_domains: input.resourceDomains } }
                : {}),
            }
          : {
              content,
              base_branch: input.baseBranch,
              head_branch: input.headBranch,
            };
      break;
    }
    case 'canvas':
      args = {
        view_key: input.viewKey,
        name: input.name,
        canvas_id: input.canvasId,
        access_level: input.accessLevel,
      };
      break;
    case 'pull_request':
      args = { pr_url: input.prUrl, name: input.name };
      break;
    case 'block_kit':
      args = {
        view_key: input.viewKey,
        name: input.name,
        blocks:
          input.blocks ??
          cardToBlockKit(
            Card({ title: input.title, children: [CardText(input.text ?? '')] })
          ),
      };
      break;
    default: {
      const unreachable: never = input;
      throw new Error(`Unsupported code-channel view: ${unreachable}`);
    }
  }
  context.abortSignal?.throwIfAborted();
  spendSlackCall(context.requestContext);
  const result = z
    .object({
      view_id: z.string().min(1),
      content_version: z.number().optional(),
    })
    .parse(
      await slack.webClient.apiCall('agents.conversations.setView', {
        channel_id: channel,
        type: input.type,
        ...args,
      })
    );
  return {
    channelId: `slack:${channel}`,
    viewId: result.view_id,
    contentVersion: result.content_version,
  };
}

export const setCodeChannelViewTool = createTool({
  id: 'set_code_channel_view',
  description:
    'Create or update a preview tab in the current code channel. HTML and diff content come from a sandbox file. HTML must be self-contained; declared HTTPS resource origins allow assets, not network fetches. Reuse viewKey to update a tab. Slack allows five tabs and one diff. viewId is the tab id, never the backing file id.',
  inputSchema: codeViewInputSchema,
  outputSchema: z.strictObject({
    channelId: z.string(),
    viewId: z.string(),
    contentVersion: z.number().optional(),
  }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Updated ${input?.type} code-channel view`,
      }),
    },
  },
  execute: publishView,
});

export const updateCodeChannelTool = createTool({
  id: 'update_code_channel',
  description:
    'Update the current code channel context bar, summary message or external resource. The context bar replaces all items, so send every item to retain. Only informational items are supported; managed view metadata is updated by set_code_channel_view.',
  inputSchema: codePropertiesInputSchema,
  outputSchema: z.strictObject({ channelId: z.string() }),
  transform: {
    display: { output: () => ({ summary: 'Updated code-channel context' }) },
  },
  execute: async ({ contextBarItems, summaryMessage, resource }, context) => {
    const channel = await currentCodeChannel(context);
    if (!(contextBarItems || summaryMessage || resource)) {
      throw new Error(
        'Provide context items, a summary message or a resource.'
      );
    }
    spendSlackCall(context.requestContext);
    await slack.webClient.apiCall('agents.conversations.setProperties', {
      channel_id: channel,
      ...(contextBarItems || summaryMessage
        ? {
            code_channel: {
              ...(contextBarItems
                ? { context_bar_items: contextBarItems }
                : {}),
              ...(summaryMessage
                ? {
                    summary_message: {
                      message_ts: summaryMessage.messageTs,
                      thread_ts: summaryMessage.threadTs,
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(resource
        ? {
            agent_resource: {
              url: resource.url,
              resource_type: resource.resourceType,
              title: resource.title,
              provider: resource.provider,
            },
          }
        : {}),
    });
    return { channelId: `slack:${channel}` };
  },
});

export const setCodeChannelCommandsTool = createTool({
  id: 'set_code_channel_commands',
  description:
    'Register the complete set of agent slash commands for the current code channel. Registration replaces this agent’s previous commands; pass an empty array to clear them. Commands appear in Slack typeahead and are delivered to the configured code-channel slash-command URL.',
  inputSchema: codeCommandsInputSchema,
  outputSchema: z.strictObject({
    channelId: z.string(),
    commandCount: z.number().int().nonnegative(),
  }),
  transform: {
    display: { output: () => ({ summary: 'Updated code-channel commands' }) },
  },
  execute: async ({ commands }, context) => {
    const channel = await currentCodeChannel(context);
    spendSlackCall(context.requestContext);
    const result = z
      .object({ command_count: z.number().int().nonnegative().optional() })
      .parse(
        await slack.webClient.apiCall('agents.conversations.setCommands', {
          channel_id: channel,
          commands: commands.map(
            ({ argumentHint, shouldEscape, ...command }) => ({
              ...command,
              ...(argumentHint ? { argument_hint: argumentHint } : {}),
              ...(shouldEscape === undefined
                ? {}
                : { should_escape: shouldEscape }),
            })
          ),
        })
      );
    return {
      channelId: `slack:${channel}`,
      commandCount: result.command_count ?? commands.length,
    };
  },
});

export const archiveCodeChannelTool = createTool({
  id: 'archive_code_channel',
  requireApproval: true,
  description:
    'Archive the current code channel for every member only when the user asks to archive or close it. Its history and tabs stay readable. Optionally identify an existing final summary message; do not archive after every answer.',
  inputSchema: z.strictObject({
    summaryMessageTs: z
      .string()
      .regex(/^\d+\.\d+$/)
      .optional(),
  }),
  outputSchema: z.strictObject({ channelId: z.string() }),
  transform: {
    display: { output: () => ({ summary: 'Archived code channel' }) },
  },
  execute: async ({ summaryMessageTs }, context) => {
    const channel = await currentCodeChannel(context);
    spendSlackCall(context.requestContext);
    await slack.webClient.apiCall('agents.conversations.archive', {
      channel_id: channel,
      summary_message_ts: summaryMessageTs,
    });
    return { channelId: `slack:${channel}` };
  },
});

export const codeChannelTools = {
  create_code_channel: createCodeChannelTool,
  set_code_channel_view: setCodeChannelViewTool,
  update_code_channel: updateCodeChannelTool,
  set_code_channel_commands: setCodeChannelCommandsTool,
  archive_code_channel: archiveCodeChannelTool,
};
