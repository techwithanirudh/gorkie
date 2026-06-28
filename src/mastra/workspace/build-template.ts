import { defaultBuildLogger, Template } from 'e2b';
import { template, workdir } from './config';
import { env } from '@/env';

async function main(): Promise<void> {
  console.log(`[sandbox] building e2b template: ${template}`);

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
        { noInstallRecommends: true },
      )
      .runCmd([
        'if command -v fdfind >/dev/null 2>&1; then ln -sf "$(command -v fdfind)" /usr/local/bin/fd; fi',
        'apt-get purge -y nodejs nodejs-doc || true',
        'apt-get autoremove -y || true',
        'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -',
        'apt-get install -y nodejs',
        'ln -sf /usr/bin/node /usr/local/bin/node && ln -sf /usr/bin/npm /usr/local/bin/npm && ln -sf /usr/bin/npx /usr/local/bin/npx',
        'npm config --global set prefix /usr/local',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user --upgrade pip',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user pillow matplotlib numpy pandas requests agentmail',
        'npm install -g agent-browser wrangler',
        'bash -lc "yes | agent-browser install --with-deps"',
        `mkdir -p ${workdir}/attachments ${workdir}/output`,
        `chown -R user:user ${workdir}`,
      ])
      .setUser('user')
      .setWorkdir(workdir),
    template,
    { apiKey: env.E2B_API_KEY, onBuildLogs: defaultBuildLogger() },
  );

  console.log(`[sandbox] built e2b template: ${build.templateId}`);
}

main().catch((error: unknown) => {
  console.error('[sandbox] failed to build e2b template', error);
  process.exit(1);
});
