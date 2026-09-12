import { cardToSlackBlocks } from '@chat-adapter/slack/blocks';
import { Card, Section } from 'chat';

export const content = {
  starters: [
    {
      title: 'Research with sources',
      message:
        'Research what changed recently in AI agents. Compare at least three sources and give me a short briefing with links.',
    },
    {
      title: 'Build a useful file',
      message:
        'Build a weekly planner as an HTML file, check it renders in the sandbox, and upload it here.',
    },
    {
      title: 'Find Slack decisions',
      message:
        'Search Slack for decisions made in the last seven days and summarize them with links to the original messages.',
    },
    {
      title: 'Schedule a check-in',
      message:
        'Ask me for my timezone, then schedule a weekday 9 AM reminder to review my priorities.',
    },
  ],
  home: {
    type: 'home',
    blocks: cardToSlackBlocks(
      Card({
        title: "I'm Gorkie",
        children: [
          Section([
            {
              type: 'text',
              content:
                'I can search Slack and the web, read pages, write and run code, keep scheduled tasks, and work with canvases and files.',
            },
          ]),
        ],
      })
    ),
  },
};
