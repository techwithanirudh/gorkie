import { env } from '@/env';

const placeholder = Buffer.from(
  "nice try, we're not leaking real creds into a sandbox",
  'utf8'
).toString('base64');

export function sandboxEnv(): Record<string, string> {
  return {
    SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'gorkie-agent',
    GIT_AUTHOR_EMAIL: 'gorkie@agentmail.to',
    GIT_COMMITTER_NAME: 'gorkie-agent',
    GIT_COMMITTER_EMAIL: 'gorkie@agentmail.to',
    ...(env.AGENTMAIL_API_KEY ? { AGENTMAIL_API_KEY: placeholder } : {}),
  };
}
