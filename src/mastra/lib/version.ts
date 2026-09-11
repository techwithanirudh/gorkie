import { execFileSync } from 'node:child_process';

interface Commit {
  sha: string;
  subject: string;
  url: string | undefined;
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim() || undefined;
  } catch {
    // A built deploy may have no git and no checkout. Drop the footer rather
    // than taking the App Home down over it.
  }
}

function readCommit(): Commit | undefined {
  const sha = git(['rev-parse', '--short', 'HEAD']);
  if (!sha) {
    return;
  }
  const remote = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(
    git(['remote', 'get-url', 'origin']) ?? ''
  );
  return {
    sha,
    subject: git(['log', '-1', '--format=%s']) ?? '',
    url: remote ? `https://github.com/${remote[1]}/commit/${sha}` : undefined,
  };
}

// The checkout cannot change under a running process, so read it once.
export const commit = readCommit();
