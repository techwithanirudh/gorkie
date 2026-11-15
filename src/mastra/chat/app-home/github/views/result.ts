import { CardText, Modal } from 'chat';
import type { DeviceLogin } from '../../../../lib/github';
import { ids } from '../ids';

export const failedModal = (reason: string) => {
  const explained =
    {
      expired_token: 'The code ran out before GitHub confirmed.',
      interrupted: 'Gorkie restarted while waiting, losing track of this code.',
    }[reason] ?? `GitHub stopped the sign-in: ${reason}.`;
  return Modal({
    callbackId: ids.modal,
    title: 'Not signed in',
    submitLabel: 'Done',
    closeLabel: 'Close',
    children: [
      CardText(`:warning: ${explained}`),
      CardText('Press Reconnect for a new code.'),
    ],
  });
};

export const pendingModal = (device: DeviceLogin) =>
  Modal({
    callbackId: ids.modal,
    title: 'Not confirmed yet',
    submitLabel: 'Done',
    closeLabel: 'Close',
    children: [
      CardText(
        `GitHub has not confirmed yet. Open ${device.verificationUri} and enter this code. This updates once it does.`
      ),
      CardText(`\`${device.userCode}\``),
    ],
  });

export const connectedModal = (login: string) =>
  Modal({
    callbackId: ids.modal,
    title: 'Signed in',
    submitLabel: 'Done',
    closeLabel: 'Close',
    children: [
      CardText(`:white_check_mark: Signed in as *${login}*.`),
      CardText(
        'Gorkie now reaches the repositories you installed it on. The GitHub section shows that, and when it stops to ask.'
      ),
    ],
  });
