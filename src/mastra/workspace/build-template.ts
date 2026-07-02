import { defaultBuildLogger, Template } from 'e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { p } from './path';

async function main(): Promise<void> {
  console.log(`[sandbox] building e2b template: ${config.template}`);
  const attachments = p('attachments');
  const output = p('output');

  const build = await Template.build(
    Template()
      .fromBaseImage()
      .setEnvs({ HOME: '/home/user' })
      .setUser('root')
      .runCmd('apt-get update')
      .aptInstall(
        [
          'curl',
          'ca-certificates',
          'fd-find',
          'ripgrep',
          'imagemagick',
          'ffmpeg',
          'python3-pip',
          'python3-pil',
          'expect',
          'zip',
          'unzip',
          'jq',
          'sudo',
        ],
        { noInstallRecommends: true }
      )
      .runCmd([
        'if command -v fdfind >/dev/null 2>&1; then ln -sf "$(command -v fdfind)" /usr/local/bin/fd; fi',
        'apt-get purge -y nodejs nodejs-doc || true',
        'apt-get autoremove -y || true',
        'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -',
        'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
        'chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list >/dev/null',
        'apt-get update',
        'apt-get install -y nodejs',
        'apt-get install -y gh',
        'ln -sf /usr/bin/node /usr/local/bin/node && ln -sf /usr/bin/npm /usr/local/bin/npm && ln -sf /usr/bin/npx /usr/local/bin/npx',
        'npm config --global set prefix /usr/local',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user --upgrade pip',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user pillow matplotlib numpy pandas requests agentmail gTTS SpeechRecognition pydub',
        'npm install -g agent-browser wrangler',
        'bash -lc "yes | agent-browser install --with-deps"',
        `mkdir -p ${attachments} ${output}`,
        `chown -R user:user ${config.workdir}`,
      ])
      .setUser('user')
      .setWorkdir(config.workdir),
    config.template,
    { apiKey: env.E2B_API_KEY, onBuildLogs: defaultBuildLogger() }
  );

  console.log(`[sandbox] built e2b template: ${build.templateId}`);
}

main().catch((error: unknown) => {
  console.error('[sandbox] failed to build e2b template', error);
  process.exit(1);
});
