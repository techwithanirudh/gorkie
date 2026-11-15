export const nearLimitPrompt =
  "You are about to hit this run's limit. Wrap up now: finish the step you are on, then write your final answer to the person as text. Do not start any new work.";

export const runLimitPrompt =
  'This run has reached its limit. Stop working and write your final answer to the person now, as text, from what you already have: what you found, how sure you are, and what is left undone. Do not call any more tools.';

export const lowQuotaPrompt = (lines: string[]) =>
  `<low_quota>\nThis person is near or at a usage limit:\n${lines.join('\n')}\nUse what is left sparingly. Anything used up is refused until it resets, so say what you could not do instead of retrying.\n</low_quota>`;

export const quotaClearPrompt =
  '<low_quota>\nThis person is back under 80% of every usage limit.\n</low_quota>';

export const mcpDownPrompt = (servers: string[]) =>
  `<mcps>The user's MCP server(s) ${servers.join(', ')} failed to connect. If they ask about missing tools or the request calls for one of these servers, mention casually that it looks down and they may want to check it in App Home.</mcps>`;

export const mcpUpPrompt =
  "<mcps>All of the user's MCP servers are connected again.</mcps>";
