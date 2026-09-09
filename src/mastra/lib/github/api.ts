import { z } from 'zod';

export async function githubApi({
  path,
  token,
}: {
  path: string;
  token: string;
}): Promise<{ data: unknown; scopes: string[] } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'gorkie',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: "Couldn't reach GitHub." };
  }
  if (!response.ok) {
    return { error: `GitHub returned ${response.status}.` };
  }
  return {
    data: await response.json().catch(() => null),
    scopes: (response.headers.get('x-oauth-scopes') ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

export async function resolveGitHubLogin(
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
