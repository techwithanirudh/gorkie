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

  test('leaves bracket-less ](dest) plain text untouched', () => {
    expect(moveAsterisksAfterMarkdownLinks('literal ](path*) here')).toBe(
      'literal ](path*) here'
    );
  });

  test('strips asterisks inside bare URLs so the token joins', () => {
    expect(moveAsterisksAfterMarkdownLinks('*https://hack.cl*ub')).toBe(
      '*https://hack.club'
    );
    expect(
      moveAsterisksAfterMarkdownLinks('see https://example.com/*path* here')
    ).toBe('see https://example.com/path here');
    expect(moveAsterisksAfterMarkdownLinks('https://hack.cl*')).toBe(
      'https://hack.cl'
    );
  });

  test('moves asterisks out of <url> autolinks', () => {
    expect(moveAsterisksAfterMarkdownLinks('*<https://hack.cl*>ub')).toBe(
      '*<https://hack.cl>*ub'
    );
    expect(moveAsterisksAfterMarkdownLinks('*<https://hack.cl>*ub')).toBe(
      '*<https://hack.cl>*ub'
    );
  });

  test('leaves url-lookalike plain text untouched', () => {
    expect(moveAsterisksAfterMarkdownLinks('xhttps://a*b')).toBe(
      'xhttps://a*b'
    );
    expect(moveAsterisksAfterMarkdownLinks('say http or <h for short')).toBe(
      'say http or <h for short'
    );
    expect(moveAsterisksAfterMarkdownLinks('<https://not closed *')).toBe(
      '<https://not closed *'
    );
  });

  test('leaves escaped brackets literal', () => {
    expect(moveAsterisksAfterMarkdownLinks(String.raw`\[label](path*)`)).toBe(
      String.raw`\[label](path*)`
    );
    expect(
      moveAsterisksAfterMarkdownLinks(
        String.raw`[escaped \] label](https://example.com/*)`
      )
    ).toBe(String.raw`[escaped \] label](https://example.com/)*`);
  });
});

describe('moveAsterisksAfterMarkdownLinksInStream', () => {
  test('normalizes a bare url split across stream chunks', async () => {
    async function* chunks() {
      yield '*ht';
      await Promise.resolve();
      yield 'tps://hack.c';
      await Promise.resolve();
      yield 'l*ub';
    }
    let out = '';
    for await (const chunk of moveAsterisksAfterMarkdownLinksInStream({
      stream: chunks(),
    })) {
      out += typeof chunk === 'string' ? chunk : '';
    }
    expect(out).toBe('*https://hack.club');
  });

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
