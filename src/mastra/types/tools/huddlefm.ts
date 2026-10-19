import { z } from 'zod';

export const huddleCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.enum([
      'request_control',
      'release_control',
      'status',
      'shuffle',
      'clear',
      'skip',
      'previous',
      'pause',
      'resume',
    ]),
  }),
  z.strictObject({ type: z.literal('search'), query: z.string().min(1) }),
  z.strictObject({ type: z.literal('add'), reference: z.string().min(1) }),
  z.strictObject({ type: z.literal('remove'), trackId: z.string().min(1) }),
  z.strictObject({
    type: z.literal('move'),
    trackId: z.string().min(1),
    position: z.number().int().positive(),
  }),
  z.strictObject({ type: z.literal('seek'), seconds: z.number() }),
  z.strictObject({
    type: z.literal('volume'),
    percent: z.number().int().min(0).max(100),
  }),
]);

export const huddleMessageSchema = z.looseObject({
  v: z.literal(1),
  replyTo: z.string(),
  ok: z.boolean(),
  type: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const huddleReplySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('pending'), commandTs: z.string() }),
  z.strictObject({
    state: z.literal('replied'),
    commandTs: z.string(),
    reply: huddleMessageSchema,
  }),
]);
