import type { ModalView } from '@slack/web-api';
import { env } from '@/env';
import type { DeviceLogin } from '../../../../lib/github';
import { ids } from '../ids';
import { text } from './shared';

export const connectView = ({
  device,
  warning,
}: {
  device: DeviceLogin;
  warning?: string;
}): ModalView => ({
  type: 'modal',
  callback_id: ids.modal,
  title: { type: 'plain_text', text: 'Connect GitHub' },
  submit: { type: 'plain_text', text: 'Done' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: [
    ...(warning ? [text(`:warning: ${warning}`)] : []),
    text(
      `*1.* <${`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`}|Choose which repositories Gorkie may use>. Pick "Only select repositories" to keep it narrow.`
    ),
    text(
      `*2.* Open <${device.verificationUri}|${device.verificationUri}> and enter this code:`
    ),
    text(`\`${device.userCode}\``),
    text(
      'GitHub keeps these separate, so do both. This closes itself once GitHub confirms, and the code lasts 15 minutes.'
    ),
  ],
});
