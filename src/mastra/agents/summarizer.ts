import { Agent } from '@mastra/core/agent';
import { env } from '@/env';

export const summarizerAgent = new Agent({
  id: 'summarizer',
  name: 'summarizer',
  description:
    'Summarizes a Slack conversation transcript concisely, preserving decisions, open questions, and action items.',
  instructions:
    'You summarize Slack threads. Be clear and concise. Preserve decisions, open questions, and action items when present. Output only the summary, no preamble.',
  model: [
    {
      model: {
        id: 'openrouter/google/gemini-2.5-flash',
        apiKey: env.HACKCLUB_API_KEY,
        url: 'https://ai.hackclub.com/proxy/v1',
      },
      maxRetries: 3,
    },
    {
      model: {
        id: 'openrouter/google/gemini-2.5-flash',
        apiKey: env.OPENROUTER_API_KEY,
        url: env.OPENROUTER_BASE_URL,
      },
      maxRetries: 3,
    },
    {
      model: {
        id: 'opencode-go/deepseek-v4-flash',
        apiKey: env.OPENCODE_API_KEY,
        url: 'https://opencode.ai/zen/go/v1',
      },
      maxRetries: 3,
    },
  ],
});
