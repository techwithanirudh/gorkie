import type { Processor } from '@mastra/core/processors';

export const firstStatus = {
  id: 'first-status',
  name: 'First Status',
  description: 'Makes every turn name its work before anything else.',
  processInputStep({ steps }) {
    if (steps.length > 0) {
      return;
    }
    return { toolChoice: { type: 'tool', toolName: 'status_update' } };
  },
} satisfies Processor<'first-status'>;
