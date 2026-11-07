const headingLevels: Record<string, 1 | 2 | 3> = { h1: 1, h2: 2, h3: 3 };
const voidTags = new Set(['br', 'col', 'hr', 'img']);

interface ElementNode {
  attrs: Record<string, string>;
  children: CanvasNode[];
  kind: 'element';
  tag: string;
}
type CanvasNode = ElementNode | { kind: 'text'; text: string };

export interface CanvasTableBlock {
  header: string[];
  rows: string[][];
  type: 'table';
}

export type CanvasBlock =
  | { level: 1 | 2 | 3; text: string; type: 'heading' }
  | { text: string; type: 'paragraph' }
  | { items: string[]; ordered: boolean; type: 'list' }
  | CanvasTableBlock
  | { text: string; type: 'code' }
  | { text: string; type: 'quote' }
  | { type: 'rule' };

function unsupported(tag: string): Error {
  return new Error(
    `This canvas contains a <${tag}> element that can't be written back as canvas markdown, so it was left untouched rather than rewritten with that part dropped. Edit it by hand in Slack instead.`
  );
}

function decodeEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&');
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return index;
    }
  }
  return -1;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of raw.matchAll(pattern)) {
    const [, name, doubleQuoted, singleQuoted] = match;
    if (name) {
      attrs[name.toLowerCase()] = decodeEntities(
        doubleQuoted ?? singleQuoted ?? ''
      );
    }
  }
  return attrs;
}

function pushText(parent: ElementNode | undefined, raw: string): void {
  if (!parent || raw.length === 0) {
    return;
  }
  parent.children.push({ kind: 'text', text: decodeEntities(raw) });
}

function parseNodes(html: string): CanvasNode[] {
  const root: ElementNode = {
    attrs: {},
    children: [],
    kind: 'element',
    tag: '#root',
  };
  const stack: ElementNode[] = [root];
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) {
      pushText(stack.at(-1), html.slice(index));
      break;
    }
    if (tagStart > index) {
      pushText(stack.at(-1), html.slice(index, tagStart));
    }
    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart);
      if (commentEnd === -1) {
        throw new Error('This canvas HTML has an unterminated comment.');
      }
      index = commentEnd + 3;
      continue;
    }
    const tagEnd = findTagEnd(html, tagStart + 1);
    if (tagEnd === -1) {
      throw new Error('This canvas HTML has an unterminated tag.');
    }
    const raw = html.slice(tagStart + 1, tagEnd).trim();
    index = tagEnd + 1;

    if (raw.startsWith('!') || raw.startsWith('?')) {
      continue;
    }
    if (raw.startsWith('/')) {
      const closingTag = raw.slice(1).trim().toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth]?.tag === closingTag) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const nameMatch = /^[a-zA-Z][-a-zA-Z0-9]*/.exec(body);
    if (!nameMatch) {
      continue;
    }
    const tag = nameMatch[0].toLowerCase();
    const element: ElementNode = {
      attrs: parseAttributes(body.slice(nameMatch[0].length)),
      children: [],
      kind: 'element',
      tag,
    };
    stack.at(-1)?.children.push(element);
    if (!(selfClosing || voidTags.has(tag))) {
      stack.push(element);
    }
  }

  return root.children;
}

function rawText(nodes: CanvasNode[]): string {
  let out = '';
  for (const node of nodes) {
    out += node.kind === 'text' ? node.text : rawText(node.children);
  }
  return out;
}

function inlineText(nodes: CanvasNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') {
      out += node.text;
      continue;
    }
    switch (node.tag) {
      case 'b':
      case 'strong':
        out += `**${inlineText(node.children)}**`;
        break;
      case 'i':
      case 'em':
        out += `_${inlineText(node.children)}_`;
        break;
      case 's':
      case 'del':
        out += `~~${inlineText(node.children)}~~`;
        break;
      case 'code':
        out += `\`${rawText(node.children)}\``;
        break;
      case 'a':
      case 'lnk': {
        const label = inlineText(node.children);
        const { href } = node.attrs;
        out += href ? `[${label}](${href})` : label;
        break;
      }
      default:
        throw unsupported(node.tag);
    }
  }
  return out;
}

function childElements(node: ElementNode, tag: string): ElementNode[] {
  return node.children.filter(
    (child): child is ElementNode =>
      child.kind === 'element' && child.tag === tag
  );
}

function tableRowElements(node: ElementNode): ElementNode[] {
  const rows: ElementNode[] = [];
  for (const child of node.children) {
    if (child.kind !== 'element') {
      continue;
    }
    if (child.tag === 'tr') {
      rows.push(child);
    } else if (child.tag === 'thead' || child.tag === 'tbody') {
      rows.push(...childElements(child, 'tr'));
    } else if (child.tag !== 'colgroup' && child.tag !== 'col') {
      throw unsupported(child.tag);
    }
  }
  return rows;
}

function cellText(cell: ElementNode): string {
  const parts: string[] = [];
  for (const child of cell.children) {
    const wrapped =
      child.kind === 'element' && (child.tag === 'p' || child.tag === 'div');
    parts.push(inlineText(wrapped ? child.children : [child]));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function tableBlock(node: ElementNode): CanvasTableBlock {
  const rows = tableRowElements(node).map((row) =>
    row.children.filter(
      (child): child is ElementNode =>
        child.kind === 'element' && (child.tag === 'td' || child.tag === 'th')
    )
  );
  const [firstRow, ...bodyRows] = rows;
  if (!firstRow || firstRow.length === 0) {
    throw new Error(
      'This canvas has a table with no cells, so nothing to update.'
    );
  }
  if (!firstRow.every((cell) => cell.tag === 'th')) {
    throw new Error(
      'This canvas has a table whose header is not its first row. Canvas markdown tables can only be written with a header row, so it was left untouched.'
    );
  }
  const header = firstRow.map(cellText);
  const body = bodyRows.map((row) => row.map(cellText));
  for (const row of body) {
    if (row.length !== header.length) {
      throw new Error(
        `This canvas has a table row with ${row.length} cells under ${header.length} columns, which canvas markdown can't express, so it was left untouched.`
      );
    }
  }
  return { header, rows: body, type: 'table' };
}

function listBlock(node: ElementNode): CanvasBlock {
  return {
    items: childElements(node, 'li').map((item) =>
      inlineText(item.children).trim()
    ),
    ordered: node.tag === 'ol',
    type: 'list',
  };
}

function blocksFrom(nodes: CanvasNode[]): CanvasBlock[] {
  const blocks: CanvasBlock[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      const text = node.text.trim();
      if (text) {
        blocks.push({ text, type: 'paragraph' });
      }
      continue;
    }
    switch (node.tag) {
      case 'div':
      case 'section':
        blocks.push(...blocksFrom(node.children));
        break;
      case 'h1':
      case 'h2':
      case 'h3': {
        const level = headingLevels[node.tag];
        if (level) {
          blocks.push({
            level,
            text: inlineText(node.children),
            type: 'heading',
          });
        }
        break;
      }
      case 'p':
        blocks.push({ text: inlineText(node.children), type: 'paragraph' });
        break;
      case 'hr':
        blocks.push({ type: 'rule' });
        break;
      case 'pre':
        blocks.push({ text: rawText(node.children), type: 'code' });
        break;
      case 'blockquote':
        blocks.push({ text: inlineText(node.children), type: 'quote' });
        break;
      case 'ul':
      case 'ol':
        blocks.push(listBlock(node));
        break;
      case 'table':
        blocks.push(tableBlock(node));
        break;
      default:
        throw unsupported(node.tag);
    }
  }
  return blocks;
}

function escapeCell(value: string): string {
  return value.replaceAll('\n', ' ').trim().replaceAll('|', '\\|');
}

function tableToMarkdown(block: CanvasTableBlock): string {
  const header = block.header.map(escapeCell);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const row of block.rows) {
    lines.push(`| ${row.map(escapeCell).join(' | ')} |`);
  }
  return lines.join('\n');
}

function blockToMarkdown(block: CanvasBlock): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`;
    case 'paragraph':
      return block.text;
    case 'rule':
      return '---';
    case 'code':
      return ['```', block.text, '```'].join('\n');
    case 'quote':
      return block.text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'list':
      return block.items
        .map((item, index) =>
          block.ordered ? `${index + 1}. ${item}` : `- ${item}`
        )
        .join('\n');
    case 'table':
      return tableToMarkdown(block);
    default:
      return '';
  }
}

export function canvasHtmlToBlocks(html: string): CanvasBlock[] {
  return blocksFrom(parseNodes(html));
}

export function blocksToMarkdown(blocks: CanvasBlock[]): string {
  return blocks
    .map(blockToMarkdown)
    .filter((value) => value.length > 0)
    .join('\n\n');
}

export function tableBlocks(
  blocks: CanvasBlock[]
): { block: CanvasTableBlock; index: number }[] {
  const tables: { block: CanvasTableBlock; index: number }[] = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type === 'table') {
      tables.push({ block, index });
    }
  }
  return tables;
}
