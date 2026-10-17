import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { TaskStatus } from '../types';
import { input, output } from '../types/tools/index';

export function taskStatusTool(read: () => Promise<TaskStatus[]>) {
  return createTool({
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
    execute: async () => ({ tasks: await read() }),
  });
}
