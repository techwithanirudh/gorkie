import type { ToolExecutionContext } from '@mastra/core/tools';
import { MCPClient } from '@mastra/mcp';
import { env } from '@/env';
import { agentmail as config } from '../config';
import { logger } from '../lib/logger';

type AgentMailTool =
  | 'list_threads'
  | 'get_thread'
  | 'list_messages'
  | 'get_message'
  | 'get_attachment'
  | 'send_message'
  | 'reply_to_message';

function connect(apiKey: string) {
  const client = new MCPClient({
    id: 'agentmail',
    servers: {
      agentmail: {
        url: new URL('https://mcp.agentmail.to/mcp'),
        allowedHosts: ['mcp.agentmail.to'],
        requestInit: { headers: { 'x-api-key': apiKey } },
      },
    },
  });
  client.__setLogger(logger);
  return client;
}

const client = env.AGENTMAIL_API_KEY
  ? connect(env.AGENTMAIL_API_KEY)
  : undefined;

export const agentmailEnabled = client !== undefined;

let listed: ReturnType<MCPClient['listToolsWithErrors']> | undefined;

// The inbox is pinned here, after the model's input, so no tool can reach
// another inbox on the account.
export async function callAgentMail({
  args,
  context,
  tool,
}: {
  args: Record<string, unknown>;
  context: ToolExecutionContext;
  tool: AgentMailTool;
}): Promise<unknown> {
  if (!client) {
    throw new Error('Email is not configured on this deployment.');
  }
  listed ??= client.listToolsWithErrors().catch((error: unknown) => {
    listed = undefined;
    throw error;
  });
  const { tools, errors } = await listed;
  // A server that fails to list is dropped from `tools`, not thrown, so a
  // failed listing is not kept and the next call connects again.
  if (errors.agentmail) {
    listed = undefined;
    logger.warn('[agentmail] listing tools failed', {
      error: errors.agentmail,
    });
    throw new Error('Could not reach the AgentMail server. Try again shortly.');
  }
  const mcpTool = tools[`agentmail_${tool}`];
  if (!mcpTool?.execute) {
    throw new Error(`The AgentMail server no longer offers ${tool}.`);
  }
  return await mcpTool.execute({ ...args, inboxId: config.inbox }, context);
}
