export const section = (text: string) => ({
  type: 'section' as const,
  text: { type: 'mrkdwn' as const, text },
});

export const heading = (title: string) => section(`*${title}*`);

export const note = (text: string) => ({
  type: 'context',
  elements: [{ type: 'mrkdwn', text }],
});
