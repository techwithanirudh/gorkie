import { createHash } from 'node:crypto';
import { E2BSandbox } from '@mastra/e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { sandboxPrompt } from '../prompts/features/sandbox';
import { baseRules } from './network';

const placeholder = Buffer.from(
  "nice try, we're not leaking real creds into a sandbox",
  'utf8'
).toString('base64');

export function createSandbox(threadId: string): E2BSandbox {
  const id = `gorkie-${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}`;

  return new E2BSandbox({
    id,
    apiKey: env.E2B_API_KEY,
    template: config.template,
    network: { rules: baseRules() },
    env: {
      SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'gorkie-agent',
      GIT_AUTHOR_EMAIL: 'gorkie@agentmail.to',
      GIT_COMMITTER_NAME: 'gorkie-agent',
      GIT_COMMITTER_EMAIL: 'gorkie@agentmail.to',
      ...(env.AGENTMAIL_API_KEY ? { AGENTMAIL_API_KEY: placeholder } : {}),
    },
    metadata: { 'thread-id': threadId },
    instructions: sandboxPrompt,
    timeout: config.timeout,
  });
}
