import { getUserTool } from './get-user';
import { readConversationHistoryTool } from './read-conversation-history';
import { getChannelInfoTool } from './get-channel-info';
import { listThreadsTool } from './list-threads';
import { getFileTool } from './get-file';
import { uploadFileTool } from './upload-file';
import { postMessageTool } from './post-message';
import { scheduleReminderTool } from './schedule-reminder';
import { leaveThreadTool } from './leave-thread';
import { searchWebTool } from './search-web';
import { searchSlackTool } from './search-slack';
import { summarizeThreadTool } from './summarize-thread';
import { skipTool } from './skip';

export const tools = {
  skip: skipTool,
  search_web: searchWebTool,
  search_slack: searchSlackTool,
  read_conversation_history: readConversationHistoryTool,
  list_threads: listThreadsTool,
  get_user: getUserTool,
  get_channel_info: getChannelInfoTool,
  get_file: getFileTool,
  upload_file: uploadFileTool,
  post_message: postMessageTool,
  schedule_reminder: scheduleReminderTool,
  leave_thread: leaveThreadTool,
  summarize_thread: summarizeThreadTool,
};
