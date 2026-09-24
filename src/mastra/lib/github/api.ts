import { request } from '@octokit/request';
import { z } from 'zod';

async function githubApi({
  path,
  token,
}: {
  path: string;
  token: string;
}): Promise<{ data: unknown } | { error: string; status?: number }> {
  try {
    const response = await request(`GET ${path}`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'gorkie' },
      request: { signal: AbortSignal.timeout(10_000) },
    });
    return { data: response.data };
  } catch (error) {
    const status = z.object({ status: z.number() }).safeParse(error)
      .data?.status;
    return status
      ? { error: `GitHub returned ${status}.`, status }
      : { error: "Couldn't reach GitHub." };
  }
}

export async function githubUser(
  token: string
): Promise<{ login: string } | { error: string }> {
  const body = await githubApi({ path: '/user', token });
  if ('error' in body) {
    return body;
  }
  const login = z.object({ login: z.string().min(1) }).safeParse(body.data)
    .data?.login;
  return login
    ? { login }
    : { error: "GitHub didn't return an account for that token." };
}

export async function countInstallations(
  token: string
): Promise<{ count: number } | { error: string; status?: number }> {
  const body = await githubApi({ path: '/user/installations', token });
  if ('error' in body) {
    return body;
  }
  return {
    count:
      z.object({ total_count: z.number() }).safeParse(body.data).data
        ?.total_count ?? 0,
  };
}

export async function repoAccess({
  repository,
  token,
}: {
  repository: string;
  token: string;
}): Promise<
  | { defaultBranch?: string; needsCredential: boolean; push: boolean }
  | { error: string }
> {
  const body = await githubApi({ path: `/repos/${repository}`, token });
  if ('error' in body) {
    return body;
  }
  const parsed = z
    .object({
      default_branch: z.string().min(1).optional(),
      private: z.boolean().optional(),
      permissions: z.object({ push: z.boolean() }).optional(),
    })
    .safeParse(body.data).data;
  return {
    ...(parsed?.default_branch ? { defaultBranch: parsed.default_branch } : {}),
    needsCredential: parsed?.private !== false,
    push: parsed?.permissions?.push === true,
  };
}
