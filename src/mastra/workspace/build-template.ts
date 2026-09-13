import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultBuildLogger, Template } from 'e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';

async function main(): Promise<void> {
  console.log(`[sandbox] building e2b template: ${config.template}`);

  const build = await Template.build(
    Template({
      fileContextPath: resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../..'
      ),
    })
      .fromBaseImage()
      .setEnvs({ HOME: '/home/user' })
      .setUser('root')
      .runCmd('apt-get update')
      .aptInstall(
        [
          'curl',
          'ca-certificates',
          'git',
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
        'mkdir -p /etc/git/disabled-hooks',
        'git config --system core.hooksPath /etc/git/disabled-hooks',
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
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user cloakbrowser',
        'mv /usr/local/bin/agent-browser /usr/local/bin/agent-browser-real',
        'python3 -c "from cloakbrowser.download import ensure_binary; ensure_binary()"',
        `chown -R user:user ${config.workdir}`,
      ])
      .copy('workspace/stealth-browser.sh', '/usr/local/bin/agent-browser', {
        mode: 0o755,
      })
      .setUser('user')
      .runCmd([
        'git config --global user.name gorkie-agent',
        'git config --global user.email gorkie@agentmail.to',
      ])
      .setWorkdir(config.workdir),
    config.template,
    {
      apiKey: env.E2B_API_KEY,
      cpuCount: 2,
      memoryMB: 1024,
      onBuildLogs: defaultBuildLogger(),
    }
  );

  console.log(`[sandbox] built e2b template: ${build.templateId}`);
}

main().catch((error: unknown) => {
  console.error('[sandbox] failed to build e2b template', error);
  process.exit(1);
});
