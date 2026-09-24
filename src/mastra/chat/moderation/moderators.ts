import { env } from '@/env';
import { rawId } from '../../lib/ids';

export function isModerator(userId: string): boolean {
  return env.MODERATORS.includes(rawId(userId));
}
