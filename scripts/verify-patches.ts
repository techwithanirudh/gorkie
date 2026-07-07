import { existsSync, readFileSync } from 'node:fs';

const CHECKS = [
  {
    file: 'node_modules/@mastra/core/dist/chunk-JGDMZZAO.js',
    signature: 'part.type === "file"',
  },
  {
    file: 'node_modules/@mastra/core/dist/chunk-EVJSSG7F.cjs',
    signature: 'part.type === "file"',
  },
];

let ok = true;
for (const { file, signature } of CHECKS) {
  if (!existsSync(file)) {
    console.error(
      `[verify-patches] Missing file: ${file} (chunk names are content-hashed — this usually means @mastra/core's version changed and the hash moved).`
    );
    ok = false;
    continue;
  }
  if (!readFileSync(file, 'utf8').includes(signature)) {
    console.error(
      `[verify-patches] Patch not applied to ${file} — expected to find "${signature}".`
    );
    ok = false;
  }
}

if (!ok) {
  console.error(
    '\n[verify-patches] patches/@mastra+core@1.50.0.patch did not apply.\n' +
      "This usually means @mastra/core's installed version no longer matches the patchedDependencies key in package.json.\n" +
      'See TODO.md ("read_file tool-result images never reach the model") for what this patch fixes and why.\n' +
      'Fix: re-derive the patch against the new version (fetch a pristine tarball, reapply the same edits, regenerate the diff), then update the patchedDependencies key.\n'
  );
  process.exit(1);
}

console.log('[verify-patches] @mastra/core patch verified OK.');
