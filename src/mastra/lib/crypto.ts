import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/env';

const PREFIX = 'v1.';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const raw = Buffer.from(env.CREDENTIALS_KEY, 'base64');
  if (raw.length !== 32) {
    throw new Error(
      'CREDENTIALS_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32'
    );
  }
  return raw;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return (
    PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  );
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    throw new Error('Stored secret is not encrypted.');
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    raw.subarray(0, IV_BYTES)
  );
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return (
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)).toString('utf8') +
    decipher.final('utf8')
  );
}
