import { detectMediaType } from '@ai-sdk/provider-utils';

const byteUnits = ['B', 'KB', 'MB', 'GB'];
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${oneDecimal.format(value)} ${byteUnits[unit]}`;
}

export function viewableImageType(bytes: Uint8Array): string | undefined {
  // Type by the actual bytes, never the extension: a mislabeled file (e.g. a
  // non-image renamed .png) sent as image/png makes the model gateway reject
  // the whole turn, and the malformed part poisons the thread's history.
  const mediaType = detectMediaType({ data: bytes, topLevelType: 'image' });
  return mediaType &&
    ['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)
    ? mediaType
    : undefined;
}
