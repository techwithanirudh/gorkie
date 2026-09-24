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

  const sandbox: E2BSandbox = new E2BSandbox({
    id,
    apiKey: env.E2B_API_KEY,
    template: config.template,
    // Ports are reachable only with the sandbox's traffic token, which stays on
    // the host; the live view's CDP port must not be public.
    network: { rules: baseRules(), allowPublicTraffic: false },
    env: {
      SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
      GIT_TERMINAL_PROMPT: '0',
      // TODO(slopradar): simplification: duplication | the git identity ('gorkie-agent', 'gorkie@agentmail.to') is written here as GIT_AUTHOR_*/GIT_COMMITTER_* and again as `git config --global` in build-template.ts:68-69; the env vars win, so the template lines are dead | keep one (the env vars here), and move the literal into config.ts if it should stay deployment-configurable
      GIT_AUTHOR_NAME: 'gorkie-agent',
      GIT_AUTHOR_EMAIL: 'gorkie@agentmail.to',
      GIT_COMMITTER_NAME: 'gorkie-agent',
      GIT_COMMITTER_EMAIL: 'gorkie@agentmail.to',
      ...(env.AGENTMAIL_API_KEY ? { AGENTMAIL_API_KEY: placeholder } : {}),
    },
    metadata: { 'thread-id': threadId },
    instructions: sandboxPrompt,
    timeout: config.timeout,
    // Reconnect and resume keep the old network rules, so a host that died
    // inside a GitHub credential window would leave the token live. A throw
    // fails the start, which is the safe outcome.
    onStart: async ({ outcome }) => {
      if (outcome !== 'created') {
        await sandbox.e2b.updateNetwork({ rules: baseRules() });
      }
    },
  });
  return sandbox;
}
