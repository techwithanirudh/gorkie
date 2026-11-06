import type { Card, Chart, Image, Table } from '../types/rich-blocks';
import { neutralizeBroadcasts } from './message';

// Slack refuses a message whose data_table cells pass about 20k characters.
const MAX_TABLE_CHARS = 19_000;

function chartBlock(chart: Chart) {
  const title = neutralizeBroadcasts(chart.title);
  if (chart.type === 'pie') {
    return {
      type: 'data_visualization',
      title,
      chart: {
        type: 'pie',
        segments: chart.segments.map(({ label, value }) => ({
          label: neutralizeBroadcasts(label),
          value,
        })),
      },
    };
  }
  const categories = chart.categories.map(neutralizeBroadcasts);
  return {
    type: 'data_visualization',
    title,
    chart: {
      type: chart.type,
      series: chart.series.map(({ name, values }) => ({
        name: neutralizeBroadcasts(name),
        data: values.map((value, index) => ({
          label: categories[index],
          value,
        })),
      })),
      axis_config: {
        categories,
        ...(chart.xLabel ? { x_label: chart.xLabel } : {}),
        ...(chart.yLabel ? { y_label: chart.yLabel } : {}),
      },
    },
  };
}

function tableCellBlock(cell: string | number) {
  if (typeof cell === 'number') {
    return { type: 'raw_number', value: cell, text: String(cell) };
  }
  const text = neutralizeBroadcasts(cell);
  // A number written as a string should still sort as a number.
  if (/^-?\d+(?:\.\d+)?$/.test(text) && text.length <= 16) {
    return { type: 'raw_number', value: Number(text), text };
  }
  return { type: 'raw_text', text: text || '-' };
}

function tableBlock(table: Table) {
  return {
    type: 'data_table',
    caption: neutralizeBroadcasts(table.caption),
    page_size: Math.min(10, table.rows.length),
    row_header_column_index: 0,
    rows: [
      table.columns.map((column) => ({
        type: 'raw_text',
        text: neutralizeBroadcasts(column),
      })),
      ...table.rows.map((row) => row.map(tableCellBlock)),
    ],
  };
}

function chartFallback(chart: Chart): string {
  if (chart.type === 'pie') {
    const parts = chart.segments.map((s) => `${s.label}: ${s.value}`);
    return `*${chart.title}*\n${parts.join('\n')}`;
  }
  const lines = chart.series.map(
    ({ name, values }) =>
      `${name}: ${values.map((value, i) => `${chart.categories[i]} ${value}`).join(', ')}`
  );
  return `*${chart.title}*\n${lines.join('\n')}`;
}

function tableFallback(table: Table): string {
  const rows = table.rows.map((row) => row.join(' | '));
  return `*${table.caption}*\n${[table.columns.join(' | '), ...rows].join('\n')}`;
}

function imageBlock({ alt, title, url }: Image) {
  return {
    type: 'image',
    image_url: url,
    alt_text: neutralizeBroadcasts(alt),
    ...(title
      ? { title: { type: 'plain_text', text: neutralizeBroadcasts(title) } }
      : {}),
  };
}

function cardBlock(card: Card, index: number) {
  const plain = (text: string) => ({
    type: 'plain_text',
    text: neutralizeBroadcasts(text),
  });
  return {
    type: 'card',
    title: plain(card.title),
    ...(card.subtitle ? { subtitle: plain(card.subtitle) } : {}),
    ...(card.body
      ? { body: { type: 'mrkdwn', text: neutralizeBroadcasts(card.body) } }
      : {}),
    ...(card.imageUrl
      ? {
          hero_image: {
            type: 'image',
            image_url: card.imageUrl,
            alt_text: neutralizeBroadcasts(card.title),
          },
        }
      : {}),
    ...(card.url
      ? {
          actions: [
            {
              type: 'button',
              action_id: `link:card_${index + 1}`,
              text: plain(card.button ?? 'Open'),
              url: card.url,
            },
          ],
        }
      : {}),
  };
}

function cardsBlocks(cards: Card[]): unknown[] {
  if (cards.length === 0) {
    return [];
  }
  const blocks = cards.map(cardBlock);
  return blocks.length === 1
    ? blocks
    : [{ type: 'carousel', elements: blocks }];
}

function cardFallback({ body, title, url }: Card): string {
  return [`*${title}*`, body, url].filter(Boolean).join('\n');
}

export function richBlocks({
  cards = [],
  charts = [],
  images = [],
  tables = [],
}: {
  cards?: Card[];
  charts?: Chart[];
  images?: Image[];
  tables?: Table[];
}): { blocks: unknown[]; fallback: string } {
  const tableChars = tables
    .flatMap(({ rows }) => rows.flat())
    .reduce<number>((total, cell) => total + String(cell).length, 0);
  if (tableChars > MAX_TABLE_CHARS) {
    throw new Error(
      `Tables hold ${tableChars} characters, over Slack's limit of about ${MAX_TABLE_CHARS}. Shorten or split them.`
    );
  }
  return {
    blocks: [
      ...charts.map(chartBlock),
      ...images.map(imageBlock),
      ...tables.map(tableBlock),
      ...cardsBlocks(cards),
    ],
    fallback: neutralizeBroadcasts(
      [
        ...charts.map(chartFallback),
        ...images.map(({ alt, url }) => `${alt}: ${url}`),
        ...tables.map(tableFallback),
        ...cards.map(cardFallback),
      ]
        .join('\n\n')
        .slice(0, 3000)
    ),
  };
}
