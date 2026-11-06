import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { huddleInThread, liveHuddles } from '../huddle/live';
import { channelContext } from '../lib/context';
import { rawId } from '../lib/ids';
import { taskStatusSchema } from '../types';
import { input, output } from '../types/tools/index';

export const joinHuddleTool = createTool({
  id: 'join_huddle',
  description:
    'Bring your voice into the Slack huddle running in the current channel, so people there can talk to you out loud. Use this when someone asks you to join, hop in, or come to the huddle or call. Your voice runs as the person who asked.',
  inputSchema: input({}),
  outputSchema: output({ joined: z.boolean() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.joined
          ? 'Joined the huddle'
          : 'Was already in the huddle here',
      }),
    },
  },
  execute: async (_input, context) => {
    const { channelId, userId } = channelContext(context?.requestContext);
    if (!(channelId && userId)) {
      throw new Error('Huddles can only be joined from their channel.');
    }
    // Imported late: the huddle session imports the voice agent, which
    // imports these tools.
    const { joinHuddle } = await import('../huddle');
    return { joined: await joinHuddle({ channelId, requesterId: userId }) };
  },
});

export const leaveHuddleTool = createTool({
  id: 'leave_huddle',
  description:
    "Make your voice leave the current channel's Slack huddle. Use this when someone asks you to leave, hang up, or get off the call.",
  inputSchema: input({}),
  outputSchema: output({ left: z.boolean() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.left ? 'Left the huddle' : 'Was not in a huddle here',
      }),
    },
  },
  execute: async (_input, context) => {
    const { channelId } = channelContext(context?.requestContext);
    if (!channelId) {
      throw new Error('Huddles can only be left from their channel.');
    }
    const huddle = [...liveHuddles.values()].find(
      (live) => live.channelId === rawId(channelId)
    );
    await huddle?.end('asked to leave in text');
    return { left: Boolean(huddle) };
  },
});

export const hangUpTool = createTool({
  id: 'leave',
  description:
    'Leave the huddle. Use it when someone asks you to leave, hang up, or get off the call. Say a short goodbye first.',
  inputSchema: input({}),
  outputSchema: output({ leaving: z.boolean() }),
  execute: (_input, context) => {
    const huddle = huddleInThread(
      channelContext(context?.requestContext).threadId
    );
    huddle?.hangUp();
    return Promise.resolve({ leaving: Boolean(huddle) });
  },
});

export const taskStatusTool = createTool({
  id: 'task_status',
  description:
    'List the delegations still running in this huddle: which subagent, the brief, how long it has run, how many tools it has called, the tool it is on, and the latest text it wrote, which may be partial. Call it when someone asks how a delegation is going.',
  inputSchema: input({}),
  outputSchema: output({ tasks: z.array(taskStatusSchema) }),
  execute: async (_input, context) => {
    const huddle = huddleInThread(
      channelContext(context?.requestContext).threadId
    );
    return { tasks: (await huddle?.runningTasks()) ?? [] };
  },
});
