import type { PlainTextOption } from '@slack/web-api';
import { levelsFor } from '../../../lib/github';
import { type GitHubPermission, githubPermissionSchema } from '../../../types';

const PRESETS = {
  all: {
    description: 'Even reading waits.',
    label: 'Ask for everything',
    status: '`asks for everything`',
  },
  never: {
    description: 'Nothing waits, including writes.',
    label: 'Never ask',
    status: '`never asks`',
  },
  write: {
    description: 'Reading runs. Writing and deleting wait.',
    label: 'Ask before writing or deleting',
    status: '`asks before writing or deleting`',
  },
} satisfies Record<
  GitHubPermission,
  { description: string; label: string; status: string }
>;

export function presetStatus(permission: GitHubPermission): string {
  return PRESETS[permission].status;
}

export function decodePreset(value: string | undefined): GitHubPermission {
  return githubPermissionSchema.parse(value);
}

export function decodeThreads(value: string | undefined): boolean {
  return value === 'threads';
}

export function permissionOptions(threads: boolean): PlainTextOption[] {
  return levelsFor(threads).map((value) => ({
    text: { type: 'plain_text', text: PRESETS[value].label },
    description: { type: 'plain_text', text: PRESETS[value].description },
    value,
  }));
}

export function scopeOptions(): PlainTextOption[] {
  return [
    {
      text: { type: 'plain_text', text: 'Only in a DM with you' },
      description: {
        type: 'plain_text',
        text: 'In a shared thread Gorkie writes up the task and DMs it to you instead.',
      },
      value: 'dm',
    },
    {
      text: {
        type: 'plain_text',
        text: 'Anywhere, including shared threads (dangerous)',
      },
      description: {
        type: 'plain_text',
        text: 'Anyone in the thread can steer the work, and checked-out code stays readable there for as long as the thread lives.',
      },
      value: 'threads',
    },
  ];
}
