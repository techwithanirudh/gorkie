// import { mcpClient } from '../mcp';
import { fetchUrlTool } from './fetch-url';
import { generateImageTool } from './generate-image';
import { grepTool } from './grep';
import { scheduleReminderTool } from './schedule-reminder';
import { scheduledTaskTools } from './scheduled-tasks';
import { searchWebTool } from './search-web';
import { skipTool } from './skip';
import { slackTools } from './slack';

export const baseTools = {
  ...slackTools,
  ...scheduledTaskTools,
  skip: skipTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  grep: grepTool,
  schedule_reminder: scheduleReminderTool,
  generate_image: generateImageTool,
  // ...(await mcpClient.listTools()),
};
