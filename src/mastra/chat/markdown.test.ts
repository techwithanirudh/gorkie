import { describe, expect, test } from 'bun:test';
import {
  moveAsterisksAfterMarkdownLinks,
  moveAsterisksAfterMarkdownLinksInStream,
} from './markdown';

describe('moveAsterisksAfterMarkdownLinks', () => {
  test('moves every asterisk after the closing link delimiter', () => {
    expect(
      moveAsterisksAfterMarkdownLinks(
        'See [one](https://example.com/*path*) and [two](https://two.test*).'
      )
    ).toBe(
      'See [one](https://example.com/path)** and [two](https://two.test)*.'
    );
  });

  test('supports parentheses and escaped parentheses in link destinations', () => {
    expect(
      moveAsterisksAfterMarkdownLinks(
        String.raw`[nested](https://example.com/a(*b)) [escaped](https://example.com/a\)*b)`
      )
    ).toBe(
      String.raw`[nested](https://example.com/a(b))* [escaped](https://example.com/a\)b)*`
    );
  });

  test('preserves incomplete links', () => {
    expect(
      moveAsterisksAfterMarkdownLinks('[label](https://example.com/*')
    ).toBe('[label](https://example.com/*');
  });
});

describe('moveAsterisksAfterMarkdownLinksInStream', () => {
  test('normalizes links split across stream chunks', async () => {
    async function* chunks() {
      yield 'See [la';
      await Promise.resolve();
      yield 'bel](https://example';
      yield { type: 'markdown_text' as const, text: '.com*) next' };
    }

    const normalized: Array<string | { type: 'markdown_text'; text: string }> =
      [];
    for await (const chunk of moveAsterisksAfterMarkdownLinksInStream({
      stream: chunks(),
    })) {
      if (typeof chunk === 'string' || chunk.type === 'markdown_text') {
        normalized.push(chunk);
      }
    }

    expect(normalized).toEqual([
      'See [la',
      'bel',
      { type: 'markdown_text', text: '](https://example.com)* next' },
    ]);
  });
});
