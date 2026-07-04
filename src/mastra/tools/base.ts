import { fetchUrlTool } from './fetch-url';
import { generateImageTool } from './generate-image';
import { mermaidTool } from './mermaid';
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
  mermaid: mermaidTool,
  schedule_reminder: scheduleReminderTool,
  generate_image: generateImageTool,
};
