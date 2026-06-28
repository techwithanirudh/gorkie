import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const template = 'gorkie-workspace:1.0';
export const workdir = '/home/user';

export const projectRoot = (() => {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
})();
