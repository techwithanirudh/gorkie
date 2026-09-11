import type { SandboxNetworkOpts } from 'e2b';
import { env } from '@/env';

type Rules = NonNullable<SandboxNetworkOpts['rules']>;

export function baseRules(): Rules {
  const rules: Rules = {};

  if (env.AGENTMAIL_API_KEY) {
    rules['api.agentmail.to'] = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.AGENTMAIL_API_KEY}` },
        },
      },
    ];
  }

  return rules;
}
