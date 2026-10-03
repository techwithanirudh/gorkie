import type { Message, Thread } from 'chat';
import { agent as agentConfig } from '../config';
import { slackErrorSchema } from '../types';
import { slack } from './client';
import { getMastra } from './mastra-instance';
import { memoryThread } from './memory-thread';
import { rawText, userMention } from './message';
import { setThreadState, threadStateOrNull } from './state';

const leadingMention = new RegExp(`^\\s*${userMention.source}`);

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

async function botMentionRoot({
  message,
  thread,
  threadTs,
}: {
  message: Message;
  thread: Thread;
  threadTs: string;
}): Promise<Message | null> {
  const { botUserId } = slack;
  if (!botUserId) {
    return null;
  }
  const root =
    message.id === threadTs
      ? message
      : await slack.fetchMessage(thread.id, threadTs);
  if (!root) {
    return null;
  }
  const leading = rawText(root).match(leadingMention);
  return leading?.[1] === botUserId ? root : null;
}

// Slack titles agent sessions, which exist in DMs and in channel threads. A
// channel thread gets one only when its root message opens with a mention of
// the bot, so a thread gorkie was pulled into later keeps no title.
export async function syncTitle({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<void> {
  const { channel, threadTs } = slack.decodeThreadId(thread.id);
  if (!threadTs) {
    return;
  }
  const root = thread.isDM
    ? message
    : await botMentionRoot({ message, thread, threadTs });
  if (!root) {
    return;
  }
  const title = await titleFor({ message, threadId: thread.id });
  const state = await threadStateOrNull(thread);
  if (!title || state?.lastSentSlackTitle === title) {
    return;
  }
  try {
    // Under agentView the adapter sends this as agents.sessions.rename.
    await slack.setAssistantTitle(channel, threadTs, title);
  } catch (error) {
    if (
      slackErrorSchema.safeParse(error).data?.data?.error !==
      'session_not_found'
    ) {
      throw error;
    }
    // setStatus creates the session and only reads `title` on creation.
    // `active` is the idle state the adapter already leaves at the end of
    // every reply, so it shows no spinner.
    await slack.setSessionStatus(channel, threadTs, 'active', {
      initiatorUserId: root.author.userId,
      title,
    });
  }
  await setThreadState({ thread, patch: { lastSentSlackTitle: title } });
}
