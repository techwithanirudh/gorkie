import type { PublishHome } from '../../../types';
import { registerConnect } from './connect';
import { registerSettings } from './settings';

export { githubBlocks } from './blocks';

export function registerGitHub({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  registerConnect({ publishHome });
  registerSettings({ publishHome });
}
