import type { Chat } from 'chat';
import { gorkieAgent } from '../agents/gorkie';

export function getBot(): Chat {
  const sdk = gorkieAgent.getChannels()?.sdk;
  if (!sdk) throw new Error('Chat SDK is not initialized yet.');
  return sdk;
}
