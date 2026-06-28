import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { channelContext } from '../types';

export const scheduleReminderTool = createTool({
  id: 'schedule_reminder',
  description:
    'Schedule a one-time reminder DM to the current user. Not for recurring reminders.',
  inputSchema: z.object({
    text: z.string().min(1).max(3000).describe('What to remind them about.'),
    seconds: z
      .number()
      .int()
      .min(30)
      .max(120 * 24 * 60 * 60)
      .describe('How many seconds from now to send the reminder.'),
  }),
  execute: async ({ text, seconds }, context) => {
    const userId = channelContext(context?.requestContext).userId;
    if (!userId) throw new Error('No user to remind.');
    const postAt = new Date(Date.now() + seconds * 1000);
    try {
      const dm = await chat().openDM(userId);
      await dm.schedule({ markdown: text }, { postAt });
      return { success: true, scheduledFor: postAt.toISOString(), userId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
