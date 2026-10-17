import { Agent } from '@mastra/core/agent';
import { env } from '@/env';
import { huddle as config } from '../config';
import { DeepgramVoice } from '../huddle/deepgram';
import { delegateTool } from '../huddle/delegate';
import { defaultErrorProcessors } from '../lib/error-handling';
import { stepCountIs } from '../lib/tools';
import { workingModel } from '../processors/working-model';
import * as voice from '../prompts/agents/voice';
import { voice as voiceModel } from '../providers';

// The talker in a huddle. Its only tool is `delegate`, which returns at once,
// so a turn is one fast model call and anything slow happens in a subagent
// while the room keeps talking. History lives on the huddle session, not in
// Mastra memory, so a speculative reply that gets cancelled leaves no trace.
export const voiceAgent = new Agent({
  id: 'voice',
  name: 'Voice',
  description: 'Talks in Slack huddles and delegates real work to subagents.',
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
  tools: { delegate: delegateTool },
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: config.maxOutputTokens,
      maxRetries: 2,
      reasoning: 'none',
    },
    stopWhen: stepCountIs(config.maxSteps),
  },
  outputProcessors: [workingModel('voice')],
});
