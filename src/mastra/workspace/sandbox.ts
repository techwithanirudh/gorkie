import { createHash } from 'node:crypto';
import { E2BSandbox } from '@mastra/e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { sandboxPrompt } from '../prompts/features/sandbox';

export function createSandbox(threadId: string): E2BSandbox {
  const id = `gorkie-${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}`;

  const sandbox: E2BSandbox = new E2BSandbox({
    id,
    apiKey: env.E2B_API_KEY,
    template: config.template,
    network: { rules: {}, allowPublicTraffic: false },
    env: {
      SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'gorkie-agent',
      GIT_AUTHOR_EMAIL: 'gorkie@agentmail.to',
      GIT_COMMITTER_NAME: 'gorkie-agent',
      GIT_COMMITTER_EMAIL: 'gorkie@agentmail.to',
    },
    metadata: { 'thread-id': threadId },
    instructions: sandboxPrompt,
    timeout: config.timeout,
    // A crash inside a GitHub credential window leaves its rule on the sandbox,
    // and create options do not apply when reconnecting. Failing here fails the
    // start, which is the safe outcome.
    onStart: async ({ outcome }) => {
      if (outcome !== 'created') {
        await sandbox.e2b.updateNetwork({ rules: {} });
      }
    },
  });
  return sandbox;
}
