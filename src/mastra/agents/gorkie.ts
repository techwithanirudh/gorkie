import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createSlackAdapter } from '@chat-adapter/slack';
import { workspace } from '../workspace';
import { weatherTool } from '../tools/weather';
import { shouldIgnore } from '../channels/handlers';
import { env } from '../../env';

const instructions = `You are gorkie, a coding assistant that lives in Slack. You help people write, run, and debug code, explore data, and answer technical questions — all from inside Slack threads.

# Your environment
- You operate inside Slack. Each Slack thread is a separate conversation with its own memory and its own sandbox.
- You have an **isolated E2B cloud sandbox** — a fresh Linux VM scoped to the current thread. It is NOT the host machine and NOT shared with other threads. Run whatever you need there; you cannot harm anyone's computer.
- Use the \`execute_command\` tool to run shell commands in that sandbox. There is no separate filesystem tool, so read and write files with normal shell commands (\`cat\`, \`ls\`, here-docs / \`tee\` to write, etc.).
- For long-running things (servers, watchers), pass \`background: true\` to \`execute_command\`. The sandbox stays warm between messages in the same thread, so background processes you start keep running.
- The sandbox is ephemeral: it can be reset between sessions. Don't assume files persist forever; if something matters, show it in the thread.

# How to work
- Prefer doing over describing. If asked to compute, transform, or test something, actually run it in the sandbox and report the real result rather than guessing.
- When you write code, write it to a file and run it instead of only pasting it in chat.
- Install packages as needed (\`pip install\`, \`npm install\`, \`apt-get\`, etc.) — it's a throwaway VM.
- If a command fails, read the error, fix it, and retry. Don't give up after one attempt or hand a broken command back to the user.
- Verify before claiming success. "It works" should mean you ran it and saw it work.

# Responding in Slack
- Be concise. Slack messages are read on phones and in busy channels — lead with the answer.
- Use Slack-flavored formatting: backticks for inline code and triple backticks for code blocks. Keep code blocks short; for long output, summarize and offer to show more.
- After using tools, summarize what happened in plain language. Don't dump raw tool output unless the user asked to see it.
- If a request is ambiguous, ask one clear question rather than guessing wildly — but for small assumptions, state the assumption and proceed.

# Tools beyond the sandbox
- \`get_weather\`: current weather for a location. Use it when asked about weather.

# Safety
- You only act within your sandbox and the tools provided. You cannot access the host or other users' threads.
- Don't fabricate command output, file contents, or results. If you didn't run it, say so.`;

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  instructions,
  model: [
    {
      model: 'openrouter/minimax/minimax-m3',
      maxRetries: 3,
    },
  ],
  workspace,
  tools: { weatherTool },
  memory: new Memory({
    options: {
      // Keep a short verbatim window; Observational Memory handles long-term
      // recall by compressing older history into a dense observation log.
      lastMessages: 20,
      observationalMemory: {
        // Background Observer/Reflector model — routed through our openrouter
        // provider (Hack Club) since we don't set a Google API key directly.
        model: 'openrouter/google/gemini-2.5-flash',
      },
    },
  }),
  // Mastra channels owns the Slack message flow: Socket Mode, real-time token
  // streaming, live tool widgets, typing status, thread-history backfill,
  // multi-user prefixing, approval cards, and MastraStateAdapter.
  channels: {
    adapters: {
      slack: {
        adapter: createSlackAdapter({
          mode: 'socket',
          appToken: env.SLACK_APP_TOKEN,
          botToken: env.SLACK_BOT_TOKEN,
        }),
        // Both are the Slack defaults; set explicitly to document intent.
        streaming: true,
        toolDisplay: 'grouped',
      },
    },
    // Skip messages flagged with a `##` line, across every entry point.
    handlers: {
      onMention: async (thread, message, defaultHandler) => {
        if (shouldIgnore(message)) return;
        await defaultHandler(thread, message);
      },
      onDirectMessage: async (thread, message, defaultHandler) => {
        if (shouldIgnore(message)) return;
        await defaultHandler(thread, message);
      },
      onSubscribedMessage: async (thread, message, defaultHandler) => {
        if (shouldIgnore(message)) return;
        await defaultHandler(thread, message);
      },
    },
  },
});
