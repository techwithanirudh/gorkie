import type { Message, Thread } from 'chat';
import { agent as agentConfig } from '../config';
import { slack } from './client';
import { getMastra } from './mastra-instance';
import { memoryThread } from './memory-thread';
import { setThreadState, threadStateOrNull } from './state';

async function titleFor({
  message,
  threadId,
}: {
  message: Message;
  threadId: string;
}): Promise<string | undefined> {
  const found = await memoryThread(threadId);
  if (!found) {
    return;
  }
  const { memory, thread } = found;
  // Channels creates every memory thread titled `${platform} conversation`, and
  // core only runs `generateTitle` on an untitled thread, so the configured
  // generator never fires on its own. Observational Memory retitles the thread
  // later, once it first observes.
  if (thread.title && thread.title !== 'slack conversation') {
    return thread.title;
  }
  const { generateTitle } = memory.getMergedThreadConfig();
  if (!(typeof generateTitle === 'object' && message.text.trim())) {
    return;
  }
  const title = await getMastra()
    .getAgentById(agentConfig.id)
    .generateTitleFromUserMessage({
      message: message.text,
      model: generateTitle.model,
      instructions: generateTitle.instructions,
    });
  if (!title) {
    return;
  }
  await memory.updateThread({ id: thread.id, title });
  return title;
}

// Agent view and DMs only: Slack has no title for a channel thread.
export async function syncTitle({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const { channel, threadTs } = slack.decodeThreadId(thread.id);
  if (!(thread.isDM && threadTs)) {
    return;
  }
  const title = await titleFor({ message, threadId: thread.id });
  const state = await threadStateOrNull(thread);
  if (!title || state?.lastSentSlackTitle === title) {
    return;
  }
  await slack.setAssistantTitle(channel, threadTs, title);
  await setThreadState({ thread, patch: { lastSentSlackTitle: title } });
}
