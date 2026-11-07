import { Readable } from 'node:stream';
import { cardToFallbackText } from '@chat-adapter/slack';
import type { CardElement, SentMessage, Thread } from 'chat';
import { activity as config } from '../config';
import { logger } from '../lib/logger';
import { slack } from './client';
import { neutralizeBroadcasts } from './message';
import { answerCard, cardBlocks } from './reply-card';

const fence = '```';

// Cuts at the last break before Slack's limit. The cut only moves until the text
// passes the limit, so a streamed first part settles early. A cut inside a code
// fence closes it here and reopens it in the rest.
function firstPart(text: string): { part: string; rest: string } {
  if (text.length <= config.maxMessageChars) {
    return { part: text, rest: '' };
  }
  const head = text.slice(0, config.maxMessageChars - fence.length - 1);
  const separator = ['\n\n', '\n', '. ', ' '].find(
    (candidate) => head.lastIndexOf(candidate) > head.length / 2
  );
  const cut = separator
    ? head.lastIndexOf(separator) + separator.length
    : head.length;
  const part = text.slice(0, cut).trimEnd();
  const rest = text.slice(cut).trimStart();
  return part.split(fence).length % 2 === 0
    ? { part: `${part}\n${fence}`, rest: `${fence}\n${rest}` }
    : { part, rest };
}

function splitAnswer(answer: string): string[] {
  const { part, rest } = firstPart(answer);
  return rest ? [part, ...splitAnswer(rest)] : [part];
}

// One turn's answer in Slack. It fills in while the model writes `reply`'s
// arguments, and `finish` settles it to the validated input, so a retry after a
// rejected card edits this message instead of posting a second one.
export class ReplyDraft {
  private message: Promise<string | undefined> = Promise.resolve(undefined);
  private lastCardAt = 0;
  private posted: Promise<SentMessage | undefined> | undefined;
  private sent = '';
  private stream: Readable | undefined;
  private readonly thread: Thread;
  finished = false;

  constructor(thread: Thread) {
    this.thread = thread;
  }

  private push(text: string): void {
    if (!text) {
      return;
    }
    if (!(this.stream || this.posted)) {
      this.stream = new Readable({ objectMode: true, read: () => undefined });
      this.posted = this.thread
        .post(this.stream)
        .catch((error: unknown): undefined => {
          logger.warn('[reply] streaming the answer failed', {
            error,
            threadId: this.thread.id,
          });
        });
    }
    this.stream?.push(text);
    this.sent += text;
  }

  // Held back to the last whitespace, because neutralizing is only stable on
  // whole words and a broadcast can arrive split across two deltas.
  writeMessage(message: string): void {
    const end = message.search(/\s\S*$/);
    if (end <= 0 || !(this.stream || !this.posted)) {
      return;
    }
    const { part } = firstPart(neutralizeBroadcasts(message.slice(0, end)));
    if (part.startsWith(this.sent)) {
      this.push(part.slice(this.sent.length));
    }
  }

  writeCard({ answer, card }: { answer: string; card: CardElement }): void {
    if (Date.now() - this.lastCardAt < config.updateIntervalMs) {
      return;
    }
    this.lastCardAt = Date.now();
    const previous = this.message;
    this.sendCard(answerCard({ answer: neutralizeBroadcasts(answer), card }));
    // A partial Slack rejects must not stop the finished card from posting.
    this.message = this.message.catch(async (error: unknown) => {
      logger.debug('[reply] Slack rejected a partial card', {
        error,
        threadId: this.thread.id,
      });
      return await previous;
    });
  }

  private sendCard(card: CardElement): void {
    const { channel, threadTs } = slack.decodeThreadId(this.thread.id);
    const content = {
      channel,
      blocks: cardBlocks(card) as never,
      text: cardToFallbackText(card).slice(0, 3000),
    };
    this.message = this.message.then(async (id) => {
      if (id) {
        await slack.webClient.chat.update({ ...content, ts: id });
        return id;
      }
      const sent = await slack.webClient.chat.postMessage({
        ...content,
        thread_ts: threadTs || undefined,
        unfurl_links: false,
      });
      return sent.ts;
    });
  }

  closeMessage(): void {
    this.stream?.push(null);
    this.stream = undefined;
    if (this.posted) {
      const { posted } = this;
      this.message = this.message.then(async (id) => id ?? (await posted)?.id);
    }
  }

  async finish({
    answer,
    card,
  }: {
    answer: string;
    card?: CardElement;
  }): Promise<void> {
    const [first = answer, ...later] = splitAnswer(answer);
    const last = later.pop();
    // A retry can drop the card, and its partial still has to be replaced.
    if ((card || this.lastCardAt) && !last) {
      this.closeMessage();
      await this.settleCard({
        answer: first,
        card: card ?? { type: 'card', children: [] },
      });
      return;
    }
    const unstartedLong =
      !this.posted && first.length > config.maxAnswerPreviewChars;
    if (first.startsWith(this.sent) && (this.stream || unstartedLong)) {
      for (
        let offset = this.sent.length;
        offset < first.length;
        offset += config.answerChunkChars
      ) {
        this.push(first.slice(offset, offset + config.answerChunkChars));
      }
    }
    this.closeMessage();
    const posted = await this.posted;
    if (!posted) {
      this.posted = undefined;
      this.sent = '';
      await this.thread.post({ markdown: first });
    } else if (this.sent !== first) {
      await posted.edit({ markdown: first });
    }
    for (const part of later) {
      // biome-ignore lint/performance/noAwaitInLoops: the parts have to arrive in order.
      await this.thread.post({ markdown: part });
    }
    if (!last) {
      return;
    }
    if (!card) {
      await this.thread.post({ markdown: last });
      return;
    }
    this.message = Promise.resolve(undefined);
    await this.settleCard({ answer: last, card });
  }

  private async settleCard({
    answer,
    card,
  }: {
    answer: string;
    card: CardElement;
  }): Promise<void> {
    this.sendCard(answerCard({ answer, card }));
    await this.message.catch(async (error: unknown) => {
      logger.warn('[reply] Slack rejected the card', {
        error,
        threadId: this.thread.id,
      });
      await this.thread.post({
        markdown: `${answer}\n\n${cardToFallbackText(card)}`,
      });
    });
  }
}

export const replyDrafts = new Map<string, ReplyDraft>();
