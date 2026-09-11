import { request } from '@octokit/request';
import { z } from 'zod';

async function githubApi({
  path,
  token,
}: {
  path: string;
  token: string;
}): Promise<{ data: unknown; scopes: string[] } | { error: string }> {
  try {
    const response = await request(`GET ${path}`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'gorkie' },
      request: { signal: AbortSignal.timeout(10_000) },
    });
    return {
      data: response.data,
      scopes: (response.headers['x-oauth-scopes'] ?? '')
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean),
    };
  } catch (error) {
    const status = z.object({ status: z.number() }).safeParse(error)
      .data?.status;
    return {
      error: status ? `GitHub returned ${status}.` : "Couldn't reach GitHub.",
    };
  }
}

export async function githubUser(
  token: string
): Promise<{ login: string; scopes: string[] } | { error: string }> {
  const body = await githubApi({ path: '/user', token });
  if ('error' in body) {
    return body;
  }
  const login = z.object({ login: z.string().min(1) }).safeParse(body.data)
    .data?.login;
  return login
    ? { login, scopes: body.scopes }
    : { error: "GitHub didn't return an account for that token." };
}

export async function countInstallations(token: string): Promise<number> {
  const body = await githubApi({ path: '/user/installations', token });
  if ('error' in body) {
    return 0;
  }
  return (
    z.object({ total_count: z.number() }).safeParse(body.data).data
      ?.total_count ?? 0
  );
}
