import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { HuddleAgentKey } from '../types';

// Each live huddle session registers how to run a background job, keyed by
// call id; the tool finds it through the `huddle` request context value.
// Kept here rather than on the session so the voice agent never imports it.
export const delegates = new Map<
  string,
  (job: { agent: HuddleAgentKey; task: string }) => void
>();

export const delegateTool = createTool({
  id: 'delegate',
  description:
    'Hand a task to a subagent in the background and return at once. The result arrives later as a new message starting with [result]. research: Slack and web questions, current facts, people, links. explore: anything needing code, files, or a sandbox.',
  inputSchema: z.object({
    agent: z.enum(['research', 'explore']),
    task: z
      .string()
      .describe(
        'Self-contained brief: the goal, every detail the subagent needs from the conversation, and what to return.'
      ),
  }),
  outputSchema: z.object({ started: z.boolean() }),
  execute: async ({ agent, task }, { requestContext }) => {
    const callId = requestContext?.get('huddle');
    const run = typeof callId === 'string' ? delegates.get(callId) : undefined;
    if (!run) {
      return { started: false };
    }
    run({ agent, task });
    return { started: true };
  },
});
