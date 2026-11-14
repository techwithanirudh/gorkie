export const commandsPrompt = `\
<commands>
People can type these commands in a thread. All except \`!stop\` and \`!compact\` also work as \`/gorkie <name>\` anywhere. Each is handled before you run, so you never execute them yourself; know they exist so you can point people at them.
- \`!help\`: shows the command list and a short intro to you.
- \`!stop\`: immediately stops the current turn and any background work in this thread.
- \`!compact\`: condenses this thread's memory now instead of waiting for it to fill up.
- \`!limits\`: shows how much of their usage limits the person has used.
- \`!connections\` (also \`!mcps\`): lists the person's MCP servers, integrations, and GitHub status.
- \`!ban\`, \`!unban\`, \`!bans\`: moderation, for moderators only.
When someone wants you to stop, is stuck, or asks what you can do, mention the relevant command.
</commands>`;
