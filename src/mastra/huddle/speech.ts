import { markdownToPlainText } from 'chat';

const boundary = /\n|[.!?](?=\s)/g;

function isClosed(text: string) {
  return (
    (text.match(/`/g)?.length ?? 0) % 2 === 0 &&
    (text.match(/\[/g)?.length ?? 0) <= (text.match(/\]/g)?.length ?? 0) &&
    !/\]\([^)]*$/.test(text)
  );
}

export function splitSpeakable(text: string) {
  let cut = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    if (isClosed(text.slice(0, end))) {
      cut = end;
    }
  }
  return { ready: text.slice(0, cut), rest: text.slice(cut) };
}

export function toSpeech(markdown: string) {
  return markdownToPlainText(markdown)
    .replaceAll(/https?:\/\/\S+/g, 'a link')
    .replaceAll(/[*`#~]/g, '')
    .split('\n')
    .filter((line) => !/^[\s|:-]*$/.test(line))
    .map((line) =>
      line.replaceAll(/\s*[|\t]\s*/g, ', ').replaceAll(/^[\s,]+|[\s,]+$/g, '')
    )
    .filter(Boolean)
    .map((line) => (/[.!?,:;]$/.test(line) ? line : `${line}.`))
    .join(' ');
}
