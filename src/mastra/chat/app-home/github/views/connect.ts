import type { ModalView } from '@slack/web-api';
import { env } from '@/env';
import type { DeviceLogin } from '../../../../lib/github';
import { section } from '../../blocks';
import { ids } from '../ids';

export const connectView = ({
  device,
}: {
  device: DeviceLogin;
}): ModalView => ({
  type: 'modal',
  callback_id: ids.modal,
  title: { type: 'plain_text', text: 'Connect GitHub' },
  submit: { type: 'plain_text', text: 'Done' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: [
    section(
      `*1.* <${`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`}|Choose which repositories Gorkie may use>. Pick "Only select repositories" to keep it narrow.`
    ),
    section(
      `*2.* Open <${device.verificationUri}|${device.verificationUri}> and enter this code:`
    ),
    section(`\`${device.userCode}\``),
    section(
      'GitHub keeps these separate, so do both. This closes itself once GitHub confirms, and the code lasts 15 minutes.'
    ),
  ],
});
