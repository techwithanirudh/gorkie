import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outputDir = join(root, '.mastra/output');

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!rootPkg.patchedDependencies) {
  console.log(
    '[postbuild] No patchedDependencies in package.json, nothing to do.'
  );
  process.exit(0);
}

if (!existsSync(outputDir)) {
  console.error(
    '[postbuild] .mastra/output not found; run `mastra build` first.'
  );
  process.exit(1);
}

cpSync(join(root, 'patches'), join(outputDir, 'patches'), { recursive: true });

const outputPkgPath = join(outputDir, 'package.json');
const outputPkg = JSON.parse(readFileSync(outputPkgPath, 'utf8'));
outputPkg.patchedDependencies = rootPkg.patchedDependencies;
writeFileSync(outputPkgPath, `${JSON.stringify(outputPkg, null, 2)}\n`);

console.log(
  '[postbuild] Copied patches/ and patchedDependencies into .mastra/output.'
);
