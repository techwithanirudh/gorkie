import { z } from 'zod';

export const toolDisplayModeSchema = z.enum(['hidden', 'compact', 'detailed']);

export type ToolDisplayMode = z.infer<typeof toolDisplayModeSchema>;

// Gorkie's own names are what gets stored, so a Mastra rename never strands a
// saved setting; this is the one place that knows Mastra's words for them.
export const mastraToolDisplay = {
  hidden: 'hidden',
  compact: 'grouped',
  detailed: 'timeline',
} as const satisfies Record<ToolDisplayMode, string>;
