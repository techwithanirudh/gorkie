import { env } from '@/env';

export const GITHUB_SERVER_NAME = 'github';
const HOSTED_GITHUB_MCP_URL = 'https://api.githubcopilot.com/mcp/';
export function isGitHubUrl(url: string): boolean {
  try {
    return new URL(url).host === new URL(HOSTED_GITHUB_MCP_URL).host;
  } catch {
    return false;
  }
}

export const GITHUB_SETTINGS_URL = 'https://github.com/settings/installations';
export const GITHUB_INSTALL_URL = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
