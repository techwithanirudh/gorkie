import { cardToBlockKit } from '@chat-adapter/slack';
import { toCard, toPartialCard } from '@json-render/chat';
import type { CardElement } from 'chat';
import type { CardSpec } from '../types/progress';
import { neutralizeBroadcasts } from './message';

export const followUpActionPrefix = 'follow_up:';

function neutralized(value: unknown): unknown {
  if (typeof value === 'string') {
    return neutralizeBroadcasts(value);
  }
  if (Array.isArray(value)) {
    return value.map(neutralized);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, neutralized(entry)])
  );
}

// A click sends the label, so a button can't send anything but what it shows,
// whatever value the model gave it. Slack needs each action id in a block to
// differ, so the element id provides it.
function prepared(spec: CardSpec): CardSpec {
  return {
    ...spec,
    elements: Object.fromEntries(
      Object.entries(spec.elements).map(([id, element]) => {
        const props = Object.fromEntries(
          Object.entries(element.props).map(([key, value]) => [
            key,
            neutralized(value),
          ])
        );
        return [
          id,
          {
            ...element,
            props:
              element.type === 'Button'
                ? {
                    ...props,
                    value: props.label,
                    id: `${followUpActionPrefix}${id}`,
                  }
                : props,
          },
        ];
      })
    ),
  };
}

export function replyCard(spec: CardSpec): CardElement {
  const untitled = Object.entries(spec.elements).find(
    ([, { props, type }]) => type === 'Table' && !props.caption
  );
  if (untitled) {
    throw new Error(
      `${untitled[0]}: a Table needs a caption, or Slack titles it "Table".`
    );
  }
  // Past these Slack's adapter degrades to a code block, so the model gets told.
  return toCard(prepared(spec), { limits: { charts: 2, tables: 1 } });
}

export function partialReplyCard(spec: CardSpec): CardElement | null {
  return toPartialCard(prepared(spec));
}

// One Slack message, in writing order. A card title renders as a header pinned
// to the top, so it moves below the answer.
export function answerCard({
  answer,
  card,
}: {
  answer: string;
  card: CardElement;
}): CardElement {
  return {
    type: 'card',
    imageUrl: card.imageUrl,
    children: [
      ...(answer ? [{ type: 'text' as const, content: answer }] : []),
      ...(card.title
        ? [
            {
              type: 'text' as const,
              content: card.title,
              style: 'bold' as const,
            },
          ]
        : []),
      ...(card.subtitle
        ? [
            {
              type: 'text' as const,
              content: card.subtitle,
              style: 'muted' as const,
            },
          ]
        : []),
      ...card.children,
    ],
  };
}

// Slack collapses a long section behind "Show more" and leaves a markdown block
// open, so body text skips the adapter's section conversion.
function childBlocks(child: CardElement['children'][number]): unknown[] {
  if (child.type === 'text' && !child.style) {
    return [{ type: 'markdown', text: child.content }];
  }
  if (child.type === 'section') {
    return child.children.flatMap(childBlocks);
  }
  return cardToBlockKit({ type: 'card', children: [child] });
}

export function cardBlocks(card: CardElement): unknown[] {
  return [
    ...cardToBlockKit({ type: 'card', imageUrl: card.imageUrl, children: [] }),
    ...card.children.flatMap(childBlocks),
  ];
}
