export const commands = {
  help: 'show the command list and a short intro.',
  stop: 'immediately stop the reply in progress in this thread and kill its background commands and tasks.',
  compact:
    "condense this thread's memory now instead of waiting for it to fill up.",
  connections: 'list your mcp servers, integrations, and github, with status.',
};

export type CommandName = keyof typeof commands;

export const commandsPrompt = `\
<commands>
People can type these commands in a thread. Each is handled before you run, so you never execute them yourself; know they exist so you can point people at them.
${Object.entries(commands)
  .map(([name, description]) => `- \`!${name}\`: ${description}`)
  .join('\n')}
\`!stop\` does not cancel a pending \`wait\` or a scheduled task, so those still wake you later.
When someone wants you to stop, is stuck, or asks what you can do, mention the relevant command.
</commands>`;
