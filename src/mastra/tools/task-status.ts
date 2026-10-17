import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { liveHuddles } from '../huddle/live';
import { channelContext } from '../lib/context';
import { input, output } from '../types/tools/index';

export const taskStatusTool = createTool({
  id: 'task_status',
  description:
    'List the delegations still running in this huddle: which subagent, the brief, how long it has run, how many tools it has called, the tool it is on, and the latest text it wrote, which may be partial. Call it when someone asks how a delegation is going.',
  inputSchema: input({}),
  outputSchema: output({
    tasks: z.array(
      z.object({
        agent: z.string(),
        brief: z.string(),
        runningSeconds: z.number(),
        toolCalls: z.number(),
        currentTool: z.string().optional(),
        latestText: z.string().optional(),
      })
    ),
  }),
  execute: async (_input, context) => {
    const { threadId } = channelContext(context?.requestContext);
    const huddle = [...liveHuddles.values()].find(
      (live) => live.slackThreadId === threadId
    );
    return { tasks: (await huddle?.runningTasks()) ?? [] };
  },
});
