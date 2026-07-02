import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { channelContext } from '../lib/context';

export const scheduleReminderTool = createTool({
  id: 'schedule_reminder',
  description:
    'Schedule a one-time reminder DM to the current user. Not for recurring reminders. The reminder text should include the creation context, user-relative timezone or time basis, source thread link or thread id when available, and enough inferred detail to be useful later.',
  inputSchema: z.object({
    text: z
      .string()
      .min(1)
      .max(3000)
      .describe(
        'A clean, detailed reminder. Include what to remember, why it matters, the user-relative timezone or time basis used to schedule it, when it was created, and the source thread link or thread id when available.'
      ),
    seconds: z
      .number()
      .int()
      .min(30)
      .max(120 * 24 * 60 * 60)
      .describe('How many seconds from now to send the reminder.'),
  }),
  execute: async ({ text, seconds }, context) => {
    const userId = channelContext(context?.requestContext).userId;
    if (!userId) {
      throw new Error('No user to remind.');
    }
    const postAt = new Date(Date.now() + seconds * 1000);
    try {
      const dm = await chat().openDM(userId);
      await dm.schedule({ markdown: text }, { postAt });
      return {
        success: true,
        scheduledFor: postAt.toISOString(),
        userId,
        message: `Reminder scheduled for ${postAt.toISOString()}.`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
