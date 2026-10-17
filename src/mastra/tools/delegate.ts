import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input, output } from '../types/tools/index';

// The huddle talker's only tool. Each session builds its own, so the task
// lands in that session, which runs gorkie's full agent in the background.
export function delegateTool(start: (task: string) => void) {
  return createTool({
    id: 'delegate',
    description:
      "Hand a task to gorkie's full text agent, which can search Slack and the web, read history, use GitHub, run code, and act in Slack as the person who invited you. Returns at once; the result arrives later as a [task result] note and is posted to the huddle thread.",
    inputSchema: input({
      task: z
        .string()
        .min(1)
        .describe(
          'A self contained brief: the goal, every detail needed from the conversation, and what to return.'
        ),
    }),
    outputSchema: output({ started: z.boolean() }),
    execute: ({ task }) => {
      start(task);
      return Promise.resolve({ started: true });
    },
  });
}
