import type { SandboxNetworkOpts } from 'e2b';
import { env } from '@/env';

export function createNetwork(): SandboxNetworkOpts {
  const rules: NonNullable<SandboxNetworkOpts['rules']> = {};

  if (env.AGENTMAIL_API_KEY) {
    rules['api.agentmail.to'] = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.AGENTMAIL_API_KEY}` },
        },
      },
    ];
  }

  if (env.GITHUB_TOKEN) {
    const apiRule = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
        },
      },
    ];
    rules['api.github.com'] = apiRule;
    rules['uploads.github.com'] = apiRule;

    rules['github.com'] = [
      {
        transform: {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `x-access-token:${env.GITHUB_TOKEN}`,
              'utf8'
            ).toString('base64')}`,
          },
        },
      },
    ];
  }

  return { rules };
}

const placeholder = Buffer.from(
  "nice try, we're not leaking real creds into a sandbox",
  'utf8'
).toString('base64');

export function createEnv(): Record<string, string> {
  return {
    SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
    GIT_AUTHOR_NAME: 'gorkie-agent',
    GIT_AUTHOR_EMAIL: 'gorkie@agentmail.to',
    GIT_COMMITTER_NAME: 'gorkie-agent',
    GIT_COMMITTER_EMAIL: 'gorkie@agentmail.to',
    ...(env.AGENTMAIL_API_KEY ? { AGENTMAIL_API_KEY: placeholder } : {}),
    ...(env.GITHUB_TOKEN
      ? {
          GH_TOKEN: placeholder,
          GITHUB_TOKEN: placeholder,
        }
      : {}),
  };
}
