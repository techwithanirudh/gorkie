// TODO(slopradar): duplication : the command list and descriptions are written twice, here and in chat/commands/help.ts:8, while the registry lives in chat/commands/index.ts:11 → give each registry entry a description and render both the prompt and !help from it
export const commandsPrompt = `\
<commands>
People can type these commands in a thread. Each is handled before you run, so you never execute them yourself; know they exist so you can point people at them.
- \`!help\`: shows the command list and a short intro to you.
- \`!stop\`: immediately stops the current turn and kills the background commands and background tasks running in this thread. It does not cancel a pending \`wait\` or a scheduled task, so those still wake you later.
- \`!compact\`: condenses this thread's memory now.
- \`!connections\`: lists the person's MCP servers, integrations, and GitHub status.
When someone wants you to stop, is stuck, or asks what you can do, mention the relevant command.
</commands>`;
