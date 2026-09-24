import { z } from 'zod';

export const liveViewTicketSchema = z.object({
  threadId: z.string().min(1),
});

export type LiveViewTicket = z.infer<typeof liveViewTicketSchema>;
