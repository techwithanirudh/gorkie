import type { AdapterPostableMessage, StreamChunk } from 'chat';

class MarkdownLinkNormalizer {
  private bufferedLink = '';
  private parenthesisDepth = 0;
  private readonly state = new Set<'pendingCloseBracket'>();

  push(markdown: string): string {
    let normalized = '';

    for (const character of markdown) {
      if (this.parenthesisDepth === 0) {
        if (this.state.has('pendingCloseBracket')) {
          if (character === '(') {
            this.bufferedLink = '](';
            this.parenthesisDepth = 1;
            this.state.delete('pendingCloseBracket');
            continue;
          }
          normalized += ']';
          this.state.delete('pendingCloseBracket');
        }
        if (character === ']') {
          this.state.add('pendingCloseBracket');
          continue;
        }
        normalized += character;
        continue;
      }

      this.bufferedLink += character;
      let precedingBackslashes = 0;
      for (
        let index = this.bufferedLink.length - 2;
        this.bufferedLink[index] === '\\';
        index -= 1
      ) {
        precedingBackslashes += 1;
      }
      if (precedingBackslashes % 2 === 1) {
        continue;
      }
      if (character === '(') {
        this.parenthesisDepth += 1;
        continue;
      }
      if (character !== ')') {
        continue;
      }

      this.parenthesisDepth -= 1;
      if (this.parenthesisDepth > 0) {
        continue;
      }

      const asterisks = this.bufferedLink.match(/\*/g)?.join('') ?? '';
      normalized += this.bufferedLink.replaceAll('*', '') + asterisks;
      this.bufferedLink = '';
    }

    return normalized;
  }

  finish(): string {
    const remainder = `${this.state.has('pendingCloseBracket') ? ']' : ''}${this.bufferedLink}`;
    this.bufferedLink = '';
    this.parenthesisDepth = 0;
    this.state.clear();
    return remainder;
  }
}

export function moveAsterisksAfterMarkdownLinks(markdown: string): string {
  const normalizer = new MarkdownLinkNormalizer();
  return normalizer.push(markdown) + normalizer.finish();
}

export function normalizeMarkdownMessage(
  message: AdapterPostableMessage
): AdapterPostableMessage {
  if (typeof message === 'string') {
    return moveAsterisksAfterMarkdownLinks(message);
  }
  if ('markdown' in message) {
    return {
      ...message,
      markdown: moveAsterisksAfterMarkdownLinks(message.markdown),
    };
  }
  return message;
}

export async function* moveAsterisksAfterMarkdownLinksInStream({
  stream,
}: {
  stream: AsyncIterable<string | StreamChunk>;
}): AsyncGenerator<string | StreamChunk> {
  const normalizer = new MarkdownLinkNormalizer();

  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      const normalized = normalizer.push(chunk);
      if (normalized) {
        yield normalized;
      }
      continue;
    }
    if (chunk.type === 'markdown_text') {
      const text = normalizer.push(chunk.text);
      if (text) {
        yield { ...chunk, text };
      }
      continue;
    }
    yield chunk;
  }

  const remainder = normalizer.finish();
  if (remainder) {
    yield remainder;
  }
}
