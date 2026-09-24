import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  createStateSigner,
  type StateTenant,
} from '@mastra/factory/state-signing';
import { env } from '@/env';
import {
  type LiveViewTicket,
  liveViewTicketSchema,
  type OAuthToken,
  oauthTokenSchema,
} from '../types';

export const encryptedPrefix = 'v1.';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const key = Buffer.from(env.CREDENTIALS_KEY, 'base64');

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return (
    encryptedPrefix +
    Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  );
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(encryptedPrefix)) {
    throw new Error('Stored secret is not encrypted.');
  }
  const raw = Buffer.from(stored.slice(encryptedPrefix.length), 'base64');
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

// One key for every OAuth flow, derived so it never doubles as the
// encryption key. Factory's signer expires a state after 10 minutes.
const stateSigner = createStateSigner(
  Buffer.from(hkdfSync('sha256', key, '', 'gorkie-oauth-state', 32)).toString(
    'hex'
  )
);

export function signOAuthToken(token: Omit<OAuthToken, 'nonce'>): {
  nonce: string;
  signed: string;
} {
  const signed = stateSigner.sign(
    `${token.purpose}:${token.provider}`,
    token.slackUserId,
    token.target ? { factoryProjectId: token.target } : undefined
  );
  const tenant: StateTenant | null = stateSigner.verify(signed);
  return { nonce: tenant ? tenant.nonce : '', signed };
}

export function verifyOAuthToken({
  purpose,
  signed,
}: {
  purpose: OAuthToken['purpose'];
  signed: string | undefined;
}): OAuthToken | undefined {
  const tenant: StateTenant | null = stateSigner.verify(signed);
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
const liveViewSigner = createStateSigner(
  Buffer.from(hkdfSync('sha256', key, '', 'gorkie-live-view', 32)).toString(
    'hex'
  )
);

export function signLiveViewTicket(ticket: LiveViewTicket): string {
  return liveViewSigner.sign('live', ticket.threadId);
}

export function verifyLiveViewTicket(
  signed: string | undefined
): LiveViewTicket | undefined {
  const tenant: StateTenant | null = liveViewSigner.verify(signed);
  if (tenant?.orgId !== 'live') {
    return;
  }
  return liveViewTicketSchema.safeParse({ threadId: tenant.userId }).data;
}
