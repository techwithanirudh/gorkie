import { describe, expect, test } from 'bun:test';
import { blockedByAgentGuidelines } from './guardrails';

const BOT_USER_ID = 'UBOTTEST01';

const activeThread = {
  state: Promise.resolve({ respondOnThreadMessages: true }),
};
const stoppedThread = { state: Promise.resolve({ stopped: true }) };

function message(raw: string): { raw: unknown; text: string } {
  return { raw: { text: raw }, text: raw };
}

function blocked({
  botUserId = BOT_USER_ID,
  raw,
  thread = activeThread,
}: {
  botUserId?: string | undefined;
  raw: string;
  thread?: { readonly state: Promise<unknown> };
}) {
  return blockedByAgentGuidelines({
    botUserId,
    message: message(raw),
    thread,
  });
}

describe('rule 1: double-hash comments', () => {
  test('ignores a message starting with ##', async () => {
    expect(await blocked({ raw: '## hidden from the bot' })).toBe(true);
  });

  test('ignores ## even when the bot is directly mentioned', async () => {
    expect(await blocked({ raw: `<@${BOT_USER_ID}> ## note` })).toBe(true);
  });

  test('leading whitespace still counts', async () => {
    expect(await blocked({ raw: '   ## note' })).toBe(true);
  });

  test('a ## on any line counts', async () => {
    expect(await blocked({ raw: 'hello\n## subheading' })).toBe(true);
  });

  test('a single # is not a comment', async () => {
    expect(await blocked({ raw: '# regular heading' })).toBe(false);
  });

  test('### counts as a comment prefix', async () => {
    expect(await blocked({ raw: '### deep heading' })).toBe(true);
  });
});

describe('rule 2: !stop persistence gate', () => {
  test('a stopped thread ignores later messages', async () => {
    expect(await blocked({ raw: 'hello again', thread: stoppedThread })).toBe(
      true
    );
  });

  test('a stopped thread ignores direct mentions too', async () => {
    expect(
      await blocked({
        raw: `<@${BOT_USER_ID}> hello`,
        thread: stoppedThread,
      })
    ).toBe(true);
  });

  test('an active thread still processes messages', async () => {
    expect(await blocked({ raw: 'hello again' })).toBe(false);
  });
});

describe('rule 3: ping group mentions', () => {
  test('ignores a usergroup mention without a bot mention', async () => {
    expect(
      await blocked({ raw: '<!subteam^S012345AB> please take a look' })
    ).toBe(true);
  });

  test('ignores legacy subteam tokens', async () => {
    expect(await blocked({ raw: '<!subteam@S012345AB> ping' })).toBe(true);
  });

  test('ignores labeled usergroup tokens', async () => {
    expect(await blocked({ raw: '<!subteam^S012345AB|hackers> ping' })).toBe(
      true
    );
  });

  test('ignores @here, @channel, and @everyone broadcasts', async () => {
    expect(await blocked({ raw: '<!here> anyone around?' })).toBe(true);
    expect(await blocked({ raw: '<!channel|team> meeting in five' })).toBe(
      true
    );
    expect(await blocked({ raw: '<!everyone> big news' })).toBe(true);
  });

  test('a direct bot mention overrides the ping group', async () => {
    expect(
      await blocked({
        raw: `<@${BOT_USER_ID}> <!subteam^S012345AB> what do you think?`,
      })
    ).toBe(false);
  });

  test('angle-bracket text that is not a ping group passes through', async () => {
    expect(await blocked({ raw: '<!b> is not a token' })).toBe(false);
  });
});

describe('rule 4: angle-bracket opt-out', () => {
  test('ignores messages starting with <>', async () => {
    expect(await blocked({ raw: '<> do not parse this' })).toBe(true);
  });

  test('tolerates leading whitespace', async () => {
    expect(await blocked({ raw: '  <> do not parse this' })).toBe(true);
  });

  test('a direct bot mention overrides the <> prefix', async () => {
    expect(
      await blocked({ raw: `<> <@${BOT_USER_ID}> actually parse this` })
    ).toBe(false);
  });

  test('<> later in the text is not an opt-out', async () => {
    expect(await blocked({ raw: 'generics look like a <> here' })).toBe(false);
  });
});

describe('normal traffic', () => {
  test('processes plain messages', async () => {
    expect(await blocked({ raw: 'hey can you help me debug this?' })).toBe(
      false
    );
  });

  test('processes direct mentions', async () => {
    expect(await blocked({ raw: `<@${BOT_USER_ID}> run this` })).toBe(false);
  });

  test('processes mentions of other users', async () => {
    expect(await blocked({ raw: '<@UOTHER99999> what do you think?' })).toBe(
      false
    );
  });

  test('does not treat a near-miss id as a direct mention', async () => {
    expect(await blocked({ raw: `<@${BOT_USER_ID}XX> hi` })).toBe(false);
  });

  test('still blocks ping groups when the bot id is unknown', async () => {
    expect(
      await blocked({
        botUserId: undefined,
        raw: '<!subteam^S012345AB> ping',
      })
    ).toBe(true);
    expect(await blocked({ botUserId: undefined, raw: 'plain hello' })).toBe(
      false
    );
  });
});
