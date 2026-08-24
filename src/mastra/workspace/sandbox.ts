import { createHash } from 'node:crypto';
import { E2BSandbox } from '@mastra/e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { sandboxPrompt } from '../prompts/features/sandbox';
import { sandboxEnv } from './env';
import { network } from './network';

export function createSandbox(threadId: string): E2BSandbox {
  const id = `gorkie-${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}`;

  return new E2BSandbox({
    id,
    apiKey: env.E2B_API_KEY,
    template: config.template,
    network: network(),
    env: sandboxEnv(),
    metadata: { 'thread-id': threadId },
    instructions: sandboxPrompt,
    timeout: config.timeout,
  });
}
