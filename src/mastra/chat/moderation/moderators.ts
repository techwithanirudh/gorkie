import { env } from '@/env';

export function isModerator(userId: string): boolean {
  return env.MODERATORS.includes(userId);
}
