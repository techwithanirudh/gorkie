import { Chat } from 'chat';
import type { PublishHome } from '../../../types';
import { ids } from './ids';
import { registerSettings } from './settings';

export { githubBlocks } from './blocks';

export function registerGitHub({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  // Connect is a link button; Slack still sends its click, which needs no work.
  Chat.getSingleton().onAction(ids.connect, () => undefined);
  registerSettings({ publishHome });
}
