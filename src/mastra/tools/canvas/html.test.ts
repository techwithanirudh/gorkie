import { expect, test } from 'bun:test';
import { blocksToMarkdown, canvasHtmlToBlocks, tableBlocks } from './html';

const fixture = `<div class="quip-canvas-content"><h1 id="a">Report</h1><p id="b" class="line">Intro paragraph.</p><h2 id="c">Usage</h2><table data-header="row"><tr><th><p class="line">model</p></th><th><p class="line">requests</p></th></tr><tr><td><p class="line">alpha</p></td><td><p class="line">1400</p></td></tr></table><h2 id="d">Links</h2><table data-header="row"><tr><th><p class="line">name</p></th><th><p class="line">link</p></th></tr><tr><td><p class="line">docs</p></td><td><p class="line"><lnk href="https://example.com">example</lnk></p></td></tr></table></div>`;

function separators(markdown: string): number {
  return markdown.split('\n').filter((line) => /^\|( --- \|)+$/.test(line))
    .length;
}

test('reads the blocks and tables out of canvas html', () => {
  const blocks = canvasHtmlToBlocks(fixture);
  const tables = tableBlocks(blocks);
  const [usage, links] = tables;
  expect(tables).toHaveLength(2);
  expect(usage.block.header).toEqual(['model', 'requests']);
  expect(usage.block.rows).toEqual([['alpha', '1400']]);
  expect(links.block.header).toEqual(['name', 'link']);
  expect(
    blocks.flatMap((block) => (block.type === 'heading' ? [block.text] : []))
  ).toEqual(['Report', 'Usage', 'Links']);
});

test('keeps a link inside a cell', () => {
  const tables = tableBlocks(canvasHtmlToBlocks(fixture));
  const [row] = tables[1].block.rows;
  expect(row[1]).toBe('[example](https://example.com)');
});

test('rewrites one table and leaves the rest alone', () => {
  const blocks = canvasHtmlToBlocks(fixture);
  const target = tableBlocks(blocks).at(0);
  if (!target) {
    throw new Error('fixture should have a table');
  }
  const markdown = blocksToMarkdown(
    blocks.map((block, index) =>
      index === target.index
        ? { ...target.block, rows: [['alpha', '1500']] }
        : block
    )
  );
  expect(separators(markdown)).toBe(2);
  expect(markdown.includes('1400')).toBe(false);
  expect(markdown.includes('| alpha | 1500 |')).toBe(true);
  expect(markdown.includes('## Links')).toBe(true);
});

test('refuses content it cannot write back', () => {
  expect(() => canvasHtmlToBlocks('<div><img src="x"></div>')).toThrow();
  expect(() => canvasHtmlToBlocks('<div><p>a<br>b</p></div>')).toThrow();
  expect(() =>
    canvasHtmlToBlocks('<div><table><tr><td>a</td></tr></table></div>')
  ).toThrow();
});
