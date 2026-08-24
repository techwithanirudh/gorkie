import { canvasTools } from './canvas';
import { workspaceCodeMode } from './code-mode/slack';
import { submitFeedbackTool } from './feedback';
import { fetchUrlTool } from './fetch-url';
import { generateImageTool } from './generate-image';
import { grepTool } from './grep';
import { scheduledTaskTools } from './scheduled-tasks';
import { searchWebTool } from './search-web';
import { slackTools } from './slack';
import { uploadEmojiTool } from './upload-emoji';
import { waitTool } from './wait';

export const orchestratorTools = {
  slack: workspaceCodeMode.tool,
  react: slackTools.react,
  search_slack: slackTools.search_slack,
  read_conversation_history: slackTools.read_conversation_history,
  call_slack_api: slackTools.call_slack_api,
  get_user: slackTools.get_user,
  get_permalink: slackTools.get_permalink,
  leave_thread: slackTools.leave_thread,
  summarize_thread: slackTools.summarize_thread,
  grep: grepTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  get_slack_file: slackTools.get_slack_file,
  upload_file: slackTools.upload_file,
  post_message: slackTools.post_message,
  wait: waitTool,
};

export const deferredTools = {
  ...scheduledTaskTools,
  get_channel_info: slackTools.get_channel_info,
  list_channels: slackTools.list_channels,
  list_threads: slackTools.list_threads,
  generate_image: generateImageTool,
  upload_emoji: uploadEmojiTool,
  submit_feedback: submitFeedbackTool,
  ...canvasTools,
};
