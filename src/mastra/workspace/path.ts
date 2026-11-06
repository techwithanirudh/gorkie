import { posix as path } from 'node:path';
import { sandbox } from '../config';

export function confinePath(inputPath: string): string {
  const resolved = path.resolve(sandbox.workdir, inputPath);
  if (!resolved.startsWith(`${sandbox.workdir}/`)) {
    throw new Error(`${inputPath} is outside ${sandbox.workdir}.`);
  }
  return resolved;
}

export function sandboxPath(...parts: string[]): string {
  return path.join(sandbox.workdir, ...parts);
}
