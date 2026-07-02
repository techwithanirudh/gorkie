import { createTool } from '@mastra/core/tools';
import {
  adjectives,
  colors,
  uniqueNamesGenerator,
} from 'unique-names-generator';
import { z } from 'zod';
import { executeAgent } from '../../agents/execute';
import { exploreAgent } from '../../agents/explore';
import { researchAgent } from '../../agents/research';
import { logger } from '../../lib/logger';

const agents = {
  execute: executeAgent,
  explore: exploreAgent,
  research: researchAgent,
};

function label(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export const delegateTaskTool = createTool({
  id: 'delegate_task',
  description:
    'Run a focused helper agent with visible Slack progress. Use research for Slack/web/thread research, explore for read-only workspace inspection, and execute for scoped implementation or command verification. The helper returns a compact result to you.',
  inputSchema: z.object({
    agent: z.enum(['research', 'explore', 'execute']),
    task: z
      .string()
      .min(1)
      .describe(
        'Focused task for the helper agent. Include all needed context.'
      ),
  }),
  execute: async ({ agent, task }, context) => {
    const child = agents[agent];
    const name = `${uniqueNamesGenerator({
      dictionaries: [[agent], adjectives, colors],
      length: 3,
      separator: '-',
      style: 'lowerCase',
    })}-${Date.now().toString(36)}`;
    const displayName = name
      .replace(/^(research|explore|execute)-/, '')
      .replace(/-[a-z0-9]+$/, '');
    const rootId = `agent-${name}-${Date.now()}`;
    const taskId = context.agent?.toolCallId ?? rootId;
    const toolCallIds = new Map<string, string>();
    const toolNames = new Map<string, string>();
    const updateParent = (details: string) =>
      context.writer?.custom({
        type: 'task_update',
        id: taskId,
        title: `Starting ${label(agent)} Agent: ${label(displayName)}`,
        status: 'in_progress',
        details,
      });
    const heartbeat = setInterval(() => {
      const write = updateParent('Still running.');
      write?.catch(() => undefined);
    }, 45_000);

    logger.info(`[agent] [${agent}] spawned`, { agent, name, task });

    try {
      await updateParent(task);
      const response = await child.stream(task, {
        abortSignal: context.abortSignal,
        requestContext: context.requestContext,
      });
      let textOutput = '';

      for await (const chunk of response.fullStream) {
        if (chunk.type === 'text-delta') {
          textOutput += chunk.payload.text;
          continue;
        }
        if (chunk.type === 'tool-call') {
          logger.info(`[agent] [${agent}] [${chunk.payload.toolName}] call`, {
            agent,
            name,
            tool: chunk.payload.toolName,
            toolCallId: chunk.payload.toolCallId,
          });
          await updateParent(`Running ${label(chunk.payload.toolName)}.`);
          toolCallIds.set(
            chunk.payload.toolCallId,
            `${rootId}-${chunk.payload.toolCallId}`
          );
          toolNames.set(
            chunk.payload.toolCallId,
            `agent_${name}_${chunk.payload.toolName}`
          );
          await context.writer?.custom({
            ...chunk,
            payload: {
              ...chunk.payload,
              toolCallId:
                toolCallIds.get(chunk.payload.toolCallId) ??
                `${rootId}-${chunk.payload.toolCallId}`,
              toolName:
                toolNames.get(chunk.payload.toolCallId) ??
                `agent_${name}_${chunk.payload.toolName}`,
            },
          });
          continue;
        }
        if (chunk.type === 'tool-result') {
          logger.info(`[agent] [${agent}] [${chunk.payload.toolName}] result`, {
            agent,
            name,
            tool: chunk.payload.toolName,
            toolCallId: chunk.payload.toolCallId,
            isError: chunk.payload.isError,
          });
          await context.writer?.custom({
            ...chunk,
            payload: {
              ...chunk.payload,
              toolCallId:
                toolCallIds.get(chunk.payload.toolCallId) ??
                `${rootId}-${chunk.payload.toolCallId}`,
              toolName:
                toolNames.get(chunk.payload.toolCallId) ??
                `agent_${name}_${chunk.payload.toolName}`,
            },
          });
          continue;
        }
        if (chunk.type === 'tool-error') {
          logger.info(`[agent] [${agent}] [${chunk.payload.toolName}] error`, {
            agent,
            name,
            tool: chunk.payload.toolName,
            toolCallId: chunk.payload.toolCallId,
          });
          await context.writer?.custom({
            ...chunk,
            payload: {
              ...chunk.payload,
              toolCallId:
                toolCallIds.get(chunk.payload.toolCallId) ??
                `${rootId}-${chunk.payload.toolCallId}`,
              toolName:
                toolNames.get(chunk.payload.toolCallId) ??
                `agent_${name}_${chunk.payload.toolName}`,
            },
          });
        }
      }

      const output = (await response.getFullOutput()).text || textOutput;
      return {
        success: true,
        agent,
        name,
        message: output,
      };
    } finally {
      clearInterval(heartbeat);
    }
  },
});
