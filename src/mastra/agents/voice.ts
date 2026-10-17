import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { env } from '@/env';
import { huddle as config, summarizer as summarizerConfig } from '../config';
import { DeepgramVoice } from '../huddle/deepgram';
import { defaultErrorProcessors } from '../lib/error-handling';
import { stepCountIs } from '../lib/tools';
import * as voice from '../prompts/agents/voice';
import {
  summarizer as summarizerModel,
  voice as voiceModel,
} from '../providers';

// The talker in a huddle: a thin front agent, not gorkie's full agent. It has
// no tools of its own. Each session hands it one `delegate` tool per call,
// which runs the full agent in the background, so a spoken turn stays one
// fast model call over a short prompt and a capped slice of the huddle's
// memory thread.
export const voiceAgent = new Agent({
  id: 'voice',
  name: 'Voice',
  description: 'Talks in Slack huddles and delegates real work to gorkie.',
  instructions: voice.prompt,
  model: voiceModel,
  voice: env.DEEPGRAM_API_KEY
    ? new DeepgramVoice({
        apiKey: env.DEEPGRAM_API_KEY,
        voice: config.voice,
        sttModel: config.sttModel,
      })
    : undefined,
  errorProcessors: defaultErrorProcessors(),
  // Recent turns verbatim, older ones folded by observational memory, which
  // manages history itself (Memory's `lastMessages` does not cap it). Its
  // observer buffers in the background, at a quarter of the window and
  // whenever a turn ends, so a buffer is ready when the window fills and
  // activation never blocks a spoken turn. Working memory stays off. Both
  // output caps override Mastra's 100,000 default, which the summarizer
  // models cannot produce.
  memory: new Memory({
    options: {
      workingMemory: { enabled: false },
      observationalMemory: {
        model: summarizerModel,
        scope: 'thread',
        observation: {
          messageTokens: config.historyTokens,
          bufferTokens: 0.25,
          bufferOnIdle: true,
          modelSettings: { maxOutputTokens: summarizerConfig.maxTokens.output },
        },
        reflection: {
          modelSettings: { maxOutputTokens: summarizerConfig.maxTokens.output },
        },
      },
    },
  }),
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: config.maxOutputTokens,
      maxRetries: 1,
      reasoning: 'none',
    },
    stopWhen: stepCountIs(config.maxSteps),
  },
});
