import type { ToolDisplay } from '@mastra/core/channels';
import { z } from 'zod';

export const toolDisplayModeSchema = z.enum(['hidden', 'compact', 'detailed']);

export type ToolDisplayMode = z.infer<typeof toolDisplayModeSchema>;

export type ToolDisplaySource = 'thread' | 'you' | 'default';

export const mastraToolDisplay = {
  hidden: 'hidden',
  compact: 'grouped',
  detailed: 'timeline',
} as const satisfies Record<ToolDisplayMode, ToolDisplay>;
