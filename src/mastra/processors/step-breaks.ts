import type { Processor } from '@mastra/core/processors';
import { renderKey } from './tool-display';

const turns = new WeakMap<object, { due: boolean; streamed: boolean }>();

// A grouped plan stays one Slack message across steps, so each step's text
// would run straight into the last one. Runs with no inbound Slack event
// (schedules, wakes) render hidden, where every text block is its own message.
export const stepBreaks = {
  id: 'step-breaks',
  name: 'Step Breaks',
  description:
    'Starts the text of each step on a new paragraph when it shares a Slack message with earlier text.',
  processOutputStream({ part, requestContext, state }) {
    if (!requestContext?.get(renderKey)) {
      return Promise.resolve(part);
    }
    const turn = turns.get(state) ?? { due: false, streamed: false };
    turns.set(state, turn);
    if (part.type === 'step-start') {
      turn.due = true;
      return Promise.resolve(part);
    }
    if (part.type !== 'text-delta' || !part.payload.text.trim()) {
      return Promise.resolve(part);
    }
    const text =
      turn.due && turn.streamed
        ? `\n\n${part.payload.text.trimStart()}`
        : part.payload.text;
    turn.due = false;
    turn.streamed = true;
    return Promise.resolve({ ...part, payload: { ...part.payload, text } });
  },
} satisfies Processor<'step-breaks'>;
