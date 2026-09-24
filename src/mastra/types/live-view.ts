import { z } from 'zod';

export const liveViewTicketSchema = z.object({
  threadId: z.string().min(1),
});

export type LiveViewTicket = z.infer<typeof liveViewTicketSchema>;

export interface BrowserSessionHooks {
  closed: (threadId: string) => Promise<void>;
  connected: (threadId: string) => Promise<void>;
}
