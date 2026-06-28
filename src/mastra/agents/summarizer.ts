import { Agent } from '@mastra/core/agent';
import { summarizer } from '../lib/providers';

export const summarizerAgent = new Agent({
  id: 'summarizer',
  name: 'summarizer',
  description:
    'Summarizes a Slack conversation transcript concisely, preserving decisions, open questions, and action items.',
  instructions:
    'You summarize Slack threads. Be clear and concise. Preserve decisions, open questions, and action items when present. Output only the summary, no preamble.',
  model: summarizer,
});
