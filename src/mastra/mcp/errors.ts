import { z } from 'zod';

const mastraErrorSchema = z.object({ message: z.string() });

function unwrap(raw: string): string {
  try {
    const parsed = mastraErrorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.message : raw;
  } catch {
    return raw;
  }
}

const oauthBody = z.object({
  error_description: z.string().optional(),
  error: z.string().optional(),
});

export function cleanMCPErrorMessage({
  serverName,
  raw,
}: {
  serverName: string;
  raw: string;
}): string {
  const [firstLine] = unwrap(raw).split('\n');
  let message = (firstLine ?? raw)
    .replace(`Failed to connect to MCP server ${serverName}: `, '')
    .replace('Error POSTing to endpoint: ', '')
    .trim();

  const parts = message.split(': ');
  while (parts.length > 1 && parts[0]?.endsWith('Error')) {
    parts.shift();
  }
  message = parts.join(': ');

  const brace = message.indexOf('{');
  if (brace !== -1) {
    const described = unwrapOAuth(message.slice(brace));
    if (described) {
      message = described;
    }
  }

  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return sentence.length > 200 ? `${sentence.slice(0, 200)}…` : sentence;
}

function unwrapOAuth(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return;
  }
  const fields = oauthBody.safeParse(parsed).data;
  return fields?.error_description ?? fields?.error;
}
