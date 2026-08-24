import { z } from 'zod';

const mastraErrorSchema = z.object({ message: z.string() });

function unwrap(raw: string): string {
  try {
    const parsed = mastraErrorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.message : raw;
  } catch {
    // Not JSON, so the raw string is already the message.
    return raw;
  }
}

export function cleanMCPErrorMessage({
  serverName,
  raw,
}: {
  serverName: string;
  raw: string;
}): string {
  // Everything after the first line is a stack trace.
  const firstLine = unwrap(raw).split('\n')[0]?.trim() ?? raw;

  // The server name is already shown alongside this message in the UI.
  const prefix = `Failed to connect to MCP server ${serverName}: `;
  const message = firstLine.startsWith(prefix)
    ? firstLine.slice(prefix.length)
    : firstLine;

  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}
