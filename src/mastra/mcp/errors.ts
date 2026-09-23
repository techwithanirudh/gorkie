import { z } from 'zod';

const mastraErrorSchema = z.object({ message: z.string() });

const oauthBody = z.object({
  error_description: z.string().optional(),
  error: z.string().optional(),
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Most MCP errors are plain text; JSON is only the occasional wrapped body.
  }
}

export function cleanMCPErrorMessage({
  serverName,
  raw,
}: {
  serverName: string;
  raw: string;
}): string {
  const unwrapped = mastraErrorSchema.safeParse(parseJson(raw)).data?.message;
  const [firstLine] = (unwrapped ?? raw).split('\n');
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
    const fields = oauthBody.safeParse(parseJson(message.slice(brace))).data;
    message = (fields?.error_description ?? fields?.error) || message;
  }

  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return sentence.length > 200 ? `${sentence.slice(0, 200)}…` : sentence;
}
