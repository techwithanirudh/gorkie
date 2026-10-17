import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { env } from '@/env';
import { huddle as config } from '../config';
import { DeepgramVoice } from '../huddle/deepgram';
import { channelContext } from '../lib/context';
import { defaultErrorProcessors } from '../lib/error-handling';
import { stepCountIs } from '../lib/tools';
import { workingModel } from '../processors/working-model';
import * as voice from '../prompts/agents/voice';
import { voice as voiceModel } from '../providers';
import { slackTools } from '../tools/slack';
import { exploreAgent } from './explore';
import { researchAgent } from './research';

// The talker in a huddle. Its only tool is `post_message`, plus the `leave`
// tool each session hands its runs: research and explore are subagents
// dispatched as Mastra background tasks, so a delegation returns at once and
// a turn stays one fast model call. Each huddle is a memory thread driven
// through signals (see `huddle/session.ts`).
export const voiceAgent = new Agent({
  id: 'voice',
  name: 'Voice',
  description: 'Talks in Slack huddles and delegates real work to subagents.',
  instructions: ({ requestContext }) => {
    const { threadId } = channelContext(requestContext);
    return threadId
      ? `${voice.prompt}\n\nThe huddle thread is ${threadId}.`
      : voice.prompt;
  },
  model: voiceModel,
  voice: env.DEEPGRAM_API_KEY
    ? new DeepgramVoice({
        apiKey: env.DEEPGRAM_API_KEY,
        voice: config.voice,
        sttModel: config.sttModel,
      })
    : undefined,
  errorProcessors: defaultErrorProcessors(),
  tools: { post_message: slackTools.post_message },
  agents: { research: researchAgent, explore: exploreAgent },
  backgroundTasks: {
    tools: {
      research: { enabled: true, timeoutMs: config.task.researchTimeout },
      explore: { enabled: true, timeoutMs: config.task.exploreTimeout },
    },
  },
  memory: new Memory({ options: { lastMessages: config.lastMessages } }),
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: config.maxOutputTokens,
      maxRetries: 2,
      reasoning: 'none',
    },
    // A barge-in aborts the run, and an aborted run skips the end-of-run
    // save. Saving per step keeps a delegation call made in an earlier
    // step, which is where its background result is written back.
    savePerStep: true,
    delegation: {
      messageFilter: ({ messages }) => messages.slice(-12),
    },
    stopWhen: stepCountIs(config.maxSteps),
  },
  outputProcessors: [workingModel('voice')],
});
