import type { ToolDisplay } from '@mastra/core/channels';
import { z } from 'zod';

export const toolDisplayModeSchema = z.enum(['default', 'detailed']);

export type ToolDisplayMode = z.infer<typeof toolDisplayModeSchema>;

export const mastraToolDisplay = {
  default: 'hidden',
  detailed: 'grouped',
} as const satisfies Record<ToolDisplayMode, ToolDisplay>;
