import { posix as path } from 'node:path';
import { sandbox } from '../config';

export function p(...parts: string[]): string {
  return path.join(sandbox.workdir, ...parts);
}
