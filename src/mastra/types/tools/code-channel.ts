import { z } from 'zod';

export const codeChannelSchema = z.object({
  properties: z.object({
    record_channel: z.object({ record_type: z.literal('agent_channel') }),
    agent_session: z
      .object({ encoded_agent_bot_user_ids: z.array(z.string()).optional() })
      .optional(),
  }),
});

export const codeViewInputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('html'),
    viewKey: z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
    resourceDomains: z.array(z.url({ protocol: /^https$/ })).optional(),
  }),
  z.strictObject({
    type: z.literal('diff'),
    path: z.string().min(1),
    baseBranch: z.string().optional(),
    headBranch: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('canvas'),
    viewKey: z.string().min(1),
    name: z.string().min(1),
    canvasId: z.string().regex(/^F[A-Z0-9]+$/),
    accessLevel: z.enum(['read', 'write', 'comment']).default('comment'),
  }),
  z.strictObject({
    type: z.literal('pull_request'),
    prUrl: z.url({ protocol: /^https$/ }),
    name: z.string().optional(),
  }),
  z
    .strictObject({
      type: z.literal('block_kit'),
      viewKey: z.string().min(1),
      name: z.string().min(1),
      blocks: z
        .array(z.record(z.string(), z.unknown()))
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Raw Slack Block Kit blocks, including interactive elements.'
        ),
      title: z.string().min(1).max(150).optional(),
      text: z.string().min(1).max(3000).optional(),
    })
    .refine(
      ({ blocks, title, text }) => blocks !== undefined || (title && text),
      'Provide blocks, or provide both title and text for a simple card.'
    ),
]);

export const codeCommandSchema = z.strictObject({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,30}$/i)
    .describe('Command name without the leading slash.'),
  description: z.string().min(1).max(100),
  argumentHint: z.string().max(100).optional(),
  shouldEscape: z.boolean().optional(),
});

export const codeCommandsInputSchema = z.strictObject({
  commands: z.array(codeCommandSchema).max(10),
});

export const codePropertiesInputSchema = z.strictObject({
  contextBarItems: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(64),
        label: z.string().min(1).max(128),
        icon: z
          .enum([
            'branch',
            'folder',
            'hierarchy',
            'life-ring',
            'link',
            'globe',
            'terminal',
            'code',
            'search',
            'lock',
          ])
          .optional(),
        url: z
          .url({ protocol: /^https$/ })
          .max(2048)
          .optional(),
      })
    )
    .max(5)
    .optional(),
  summaryMessage: z
    .strictObject({
      messageTs: z.string().regex(/^\d+\.\d+$/),
      threadTs: z
        .string()
        .regex(/^\d+\.\d+$/)
        .optional(),
    })
    .optional(),
  resource: z
    .strictObject({
      url: z.url({ protocol: /^https$/ }).max(2048),
      resourceType: z.string().min(1).max(64),
      title: z.string().min(1).max(255),
      provider: z.string().min(1).max(64),
    })
    .optional(),
});
