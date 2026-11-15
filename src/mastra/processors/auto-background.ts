import type { Processor } from '@mastra/core/processors';
import { autoBackgroundCommands } from '../workspace/tools';

export const autoBackground = {
  id: 'auto-background',
  name: 'Auto Background',
  description:
    'Moves a sandbox command that is still running after the wait into the background.',
  processInputStep({ tools }) {
    if (tools) {
      autoBackgroundCommands(tools);
    }
  },
} satisfies Processor<'auto-background'>;
