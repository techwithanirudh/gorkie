import { registerConnect } from './actions';
import { registerSettings } from './settings-actions';

export { githubBlocks } from './blocks';

export function registerGitHub({
  publishHome,
}: {
  publishHome: (userId: string) => Promise<void>;
}): void {
  registerConnect({ publishHome });
  registerSettings({ publishHome });
}
