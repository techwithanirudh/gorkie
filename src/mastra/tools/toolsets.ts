import { readArtifactTool } from './artifacts';
import { canvasTools } from './canvas';
import { workspaceCodeMode } from './code-mode/slack';
import { submitFeedbackTool } from './feedback';
import { fetchUrlTool } from './fetch-url';
import { focusTool } from './focus';
import { generateImageTool } from './generate-image';
import { runBackgroundTool } from './run-background';
import { scheduledTaskTools } from './scheduled-tasks';
import { searchWebTool } from './search-web';
import { skipTool } from './skip';
import { slackTools } from './slack';
import { uploadEmojiTool } from './upload-emoji';
import { viewImageTool } from './view-image';
import { waitTool } from './wait';

export async function orchestratorTools() {
  return {
    slack: (await workspaceCodeMode()).tool,
    react: slackTools.react,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    get_user: slackTools.get_user,
    get_permalink: slackTools.get_permalink,
    join_thread: slackTools.join_thread,
    leave_thread: slackTools.leave_thread,
    summarize_thread: slackTools.summarize_thread,
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    get_slack_file: slackTools.get_slack_file,
    view_image: viewImageTool,
    upload_file: slackTools.upload_file,
    post_message: slackTools.post_message,
    run_background: runBackgroundTool,
    read_artifact: readArtifactTool,
    skip: skipTool,
    wait: waitTool,
  };
}

export const deferredTools = {
  ...scheduledTaskTools,
  get_channel_info: slackTools.get_channel_info,
  list_channels: slackTools.list_channels,
  list_threads: slackTools.list_threads,
  generate_image: generateImageTool,
  get_slack_emoji: slackTools.get_slack_emoji,
  call_slack_api: slackTools.call_slack_api,
  upload_emoji: uploadEmojiTool,
  submit_feedback: submitFeedbackTool,
  focus: focusTool,
  ...canvasTools,
};
