import { registerConnect } from './connect';
import { registerSettings } from './settings';

export { githubBlocks } from './blocks';

export function registerGitHub({
  publishHome,
}: {
  publishHome: (userId: string) => Promise<void>;
}): void {
  registerConnect({ publishHome });
  registerSettings({ publishHome });
}
