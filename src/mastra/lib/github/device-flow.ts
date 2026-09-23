import { createDeviceCode, exchangeDeviceCode } from '@octokit/oauth-methods';
import { z } from 'zod';
import { env } from '@/env';
import type {
  DeviceLogin,
  DeviceLoginResult,
  GitHubAccount,
} from '../../types';

export async function startDeviceLogin(): Promise<DeviceLogin> {
  const { data } = await createDeviceCode({
    clientId: env.GITHUB_APP_CLIENT_ID,
    clientType: 'github-app',
  });
  return {
    deviceCode: data.device_code,
    expiresIn: data.expires_in,
    interval: data.interval,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
  };
}

export function toAccount(authentication: {
  expiresAt?: string;
  refreshToken?: string;
  token: string;
}): GitHubAccount {
  return {
    expiresAt: authentication.expiresAt
      ? new Date(authentication.expiresAt)
      : undefined,
    refreshToken: authentication.refreshToken,
    token: authentication.token,
  };
}

export async function awaitDeviceLogin({
  deviceCode,
  expiresIn,
  interval,
  signal,
}: DeviceLogin & { signal?: AbortSignal }): Promise<DeviceLoginResult> {
  const deadline = Date.now() + expiresIn * 1000;
  let waitMs = interval * 1000;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return { error: 'cancelled' };
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling is the protocol
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (signal?.aborted) {
      return { error: 'cancelled' };
    }
    try {
      const { authentication } = await exchangeDeviceCode({
        clientId: env.GITHUB_APP_CLIENT_ID,
        clientType: 'github-app',
        code: deviceCode,
      });
      return toAccount(authentication);
    } catch (error) {
      const code = z
        .object({
          response: z.object({ data: z.object({ error: z.string() }) }),
        })
        .safeParse(error).data?.response.data.error;
      if (code === 'authorization_pending') {
        continue;
      }
      if (code === 'slow_down') {
        waitMs += 5000;
        continue;
      }
      return { error: code ?? 'unknown' };
    }
  }
  return { error: 'expired_token' };
}
