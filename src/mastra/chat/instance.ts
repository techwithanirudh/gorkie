import type { Chat } from 'chat';

let instance: Chat | undefined;

export function setChat(bot: Chat): void {
  instance = bot;
}

export function chat(): Chat {
  if (!instance) {
    throw new Error('Chat SDK is not initialized yet.');
  }
  return instance;
}
