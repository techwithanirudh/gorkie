import type { AdapterPostableMessage, StreamChunk } from 'chat';

const URL_SCHEMES = ['http://', 'https://'];

class MarkdownLinkNormalizer {
  private bufferedLink = '';
  private parenthesisDepth = 0;
  private sawOpenBracket = false;
  private trailingBackslashes = 0;
  private bareUrlToken: string | null = null;
  private angleBuffer: string | null = null;
  private schemeBuffer: string | null = null;
  private prevDepth0Char: string | null = null;
  private readonly state = new Set<'pendingCloseBracket'>();

  private atTokenBoundary(): boolean {
    return (
      this.prevDepth0Char === null || !/[a-z0-9]/i.test(this.prevDepth0Char)
    );
  }

  push(markdown: string): string {
    let normalized = '';

    for (const character of markdown) {
      if (this.parenthesisDepth === 0) {
        // Bare URL token: asterisks inside are stripped so the token joins
        // across them (her ruling: `*https://hack.cl*ub` means hack.club).
        if (this.bareUrlToken !== null) {
          if (/\s/.test(character)) {
            normalized += this.bareUrlToken.replaceAll('*', '') + character;
            this.bareUrlToken = null;
            this.prevDepth0Char = character;
            continue;
          }
          this.bareUrlToken += character;
          continue;
        }
        // <url> autolink: asterisks inside move after the closing bracket,
        // same rule as markdown link destinations.
        if (this.angleBuffer !== null) {
          if (character === '>') {
            const asterisks = this.angleBuffer.match(/\*/g)?.join('') ?? '';
            normalized += `${this.angleBuffer.replaceAll('*', '')}>${asterisks}`;
            this.angleBuffer = null;
            this.prevDepth0Char = '>';
            continue;
          }
          if (/\s/.test(character)) {
            normalized += this.angleBuffer + character;
            this.angleBuffer = null;
            this.prevDepth0Char = character;
            continue;
          }
          this.angleBuffer += character;
          continue;
        }
        // Possible scheme start: buffer until it disambiguates.
        if (this.schemeBuffer !== null) {
          const candidate = this.schemeBuffer + character;
          const scheme = candidate.startsWith('<')
            ? candidate.slice(1)
            : candidate;
          if (URL_SCHEMES.some((known) => known.startsWith(scheme))) {
            if (URL_SCHEMES.includes(scheme)) {
              if (candidate.startsWith('<')) {
                this.angleBuffer = candidate;
              } else {
                this.bareUrlToken = candidate;
              }
              this.schemeBuffer = null;
            } else {
              this.schemeBuffer = candidate;
            }
            continue;
          }
          const flushed = this.schemeBuffer;
          normalized += flushed;
          this.schemeBuffer = null;
          this.prevDepth0Char = flushed.at(-1) ?? null;
          // fall through: the current character gets normal handling
        }
        if (this.state.has('pendingCloseBracket')) {
          if (character === '(') {
            this.bufferedLink = '](';
            this.parenthesisDepth = 1;
            this.state.delete('pendingCloseBracket');
            this.trailingBackslashes = 0;
            continue;
          }
          normalized += ']';
          this.state.delete('pendingCloseBracket');
          this.trailingBackslashes = 0;
        }
        const escaped = this.trailingBackslashes % 2 === 1;
        if (character === '\\') {
          this.trailingBackslashes += 1;
          normalized += character;
          this.prevDepth0Char = character;
          continue;
        }
        this.trailingBackslashes = 0;
        if (
          (character === 'h' || character === '<') &&
          this.atTokenBoundary()
        ) {
          this.schemeBuffer = character;
          this.prevDepth0Char = character;
          continue;
        }
        if (character === '[' && !escaped) {
          this.sawOpenBracket = true;
          normalized += character;
          this.prevDepth0Char = character;
          continue;
        }
        if (character === ']' && !escaped && this.sawOpenBracket) {
          this.sawOpenBracket = false;
          this.state.add('pendingCloseBracket');
          this.prevDepth0Char = character;
          continue;
        }
        normalized += character;
        this.prevDepth0Char = character;
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
      this.prevDepth0Char = asterisks ? '*' : ')';
    }

    return normalized;
  }

  finish(): string {
    let remainder = `${this.state.has('pendingCloseBracket') ? ']' : ''}${this.bufferedLink}`;
    if (this.bareUrlToken !== null) {
      remainder += this.bareUrlToken.replaceAll('*', '');
    }
    if (this.angleBuffer !== null) {
      remainder += this.angleBuffer;
    }
    if (this.schemeBuffer !== null) {
      remainder += this.schemeBuffer;
    }
    this.bufferedLink = '';
    this.parenthesisDepth = 0;
    this.bareUrlToken = null;
    this.angleBuffer = null;
    this.schemeBuffer = null;
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
