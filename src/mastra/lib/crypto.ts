import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  createStateSigner,
  type StateSigner,
} from '@mastra/factory/state-signing';
import { env } from '@/env';
import {
  type LiveViewTicket,
  liveViewTicketSchema,
  type OAuthToken,
  oauthTokenSchema,
} from '../types';

const IV_BYTES = 12;
const TAG_BYTES = 16;

// The key id travels in every ciphertext, so a rotation can tell which key
// sealed a row and re-encrypt only what the previous key still holds.
function keyWithId(base64: string) {
  const key = Buffer.from(base64, 'base64');
  return {
    id: createHash('sha256').update(key).digest('hex').slice(0, 8),
    key,
  };
}

const current = keyWithId(env.CREDENTIALS_KEY);
const previous = env.CREDENTIALS_KEY_PREVIOUS
  ? keyWithId(env.CREDENTIALS_KEY_PREVIOUS)
  : undefined;

export const currentSecretPrefix = `v2.${current.id}.`;

export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith('v1.') || stored.startsWith('v2.');
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', current.key, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return (
    currentSecretPrefix +
    Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  );
}

function unseal({ body, key }: { body: string; key: Buffer }): string {
  const raw = Buffer.from(body, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    raw.subarray(0, IV_BYTES)
  );
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return (
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)).toString('utf8') +
    decipher.final('utf8')
  );
}

export function decryptSecret(stored: string): string {
  const versioned = /^v2\.([0-9a-f]{8})\.(.*)$/s.exec(stored);
  if (versioned) {
    const key = [current, previous].find(
      (candidate) => candidate?.id === versioned[1]
    );
    if (!key) {
      throw new Error('Stored secret was sealed with a key that is not set.');
    }
    return unseal({ body: versioned[2] ?? '', key: key.key });
  }
  if (!stored.startsWith('v1.')) {
    throw new Error('Stored secret is not encrypted.');
  }
  // v1 carries no key id: it predates rotation, so either key may hold it.
  const body = stored.slice('v1.'.length);
  try {
    return unseal({ body, key: current.key });
  } catch (error) {
    if (!previous) {
      throw error;
    }
    return unseal({ body, key: previous.key });
  }
}

// Sign with the current key; verify with either, so a link or sign-in started
// just before a rotation still completes. Derived so it never doubles as the
// encryption key. Factory's signer expires a state after 10 minutes.
function rotatingSigner(info: string): Pick<StateSigner, 'sign' | 'verify'> {
  const derive = (key: Buffer) =>
    createStateSigner(
      Buffer.from(hkdfSync('sha256', key, '', info, 32)).toString('hex')
    );
  const signer = derive(current.key);
  const fallback = previous ? derive(previous.key) : undefined;
  return {
    sign: (...args) => signer.sign(...args),
    verify: (signed) =>
      signer.verify(signed) ?? fallback?.verify(signed) ?? null,
  };
}

const stateSigner = rotatingSigner('gorkie-oauth-state');

export function signOAuthToken(token: Omit<OAuthToken, 'nonce'>): {
  nonce: string;
  signed: string;
} {
  const signed = stateSigner.sign(
    `${token.purpose}:${token.provider}`,
    token.slackUserId,
    token.target ? { factoryProjectId: token.target } : undefined
  );
  const tenant = stateSigner.verify(signed);
  return { nonce: tenant ? tenant.nonce : '', signed };
}

export function verifyOAuthToken({
  purpose,
  signed,
}: {
  purpose: OAuthToken['purpose'];
  signed: string | undefined;
}): OAuthToken | undefined {
  const tenant = stateSigner.verify(signed);
  if (!tenant) {
    return;
  }
  const [kind, provider] = tenant.orgId.split(':');
  const parsed = oauthTokenSchema.safeParse({
    nonce: tenant.nonce,
    provider,
    purpose: kind,
    slackUserId: tenant.userId,
    target: tenant.factoryProjectId,
  });
  return parsed.success && parsed.data.purpose === purpose
    ? parsed.data
    : undefined;
}

// A separate key, so a live-view link can never pass as an OAuth state.
const liveViewSigner = rotatingSigner('gorkie-live-view');

export function signLiveViewTicket(ticket: LiveViewTicket): string {
  return liveViewSigner.sign('live', ticket.threadId);
}

export function verifyLiveViewTicket(
  signed: string | undefined
): LiveViewTicket | undefined {
  const tenant = liveViewSigner.verify(signed);
  if (tenant?.orgId !== 'live') {
    return;
  }
  return liveViewTicketSchema.safeParse({ threadId: tenant.userId }).data;
}
