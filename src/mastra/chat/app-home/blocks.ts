export const heading = (title: string) => ({
  type: 'section',
  text: { type: 'mrkdwn', text: `*${title}*` },
});

export const note = (text: string) => ({
  type: 'context',
  elements: [{ type: 'mrkdwn', text }],
});
