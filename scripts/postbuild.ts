import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const root = process.cwd();
const outputDir = join(root, '.mastra/output');

const rootPkg = z
  .looseObject({ patchedDependencies: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));

if (!existsSync(outputDir)) {
  console.error(
    '[postbuild] .mastra/output not found; run `mastra build` first.'
  );
  process.exit(1);
}

cpSync(join(root, 'patches'), join(outputDir, 'patches'), { recursive: true });
cpSync(join(root, 'drizzle'), join(outputDir, 'drizzle'), { recursive: true });

const outputPkgPath = join(outputDir, 'package.json');
const outputPkg = z
  .looseObject({})
  .parse(JSON.parse(readFileSync(outputPkgPath, 'utf8')));
outputPkg.patchedDependencies = rootPkg.patchedDependencies;
writeFileSync(outputPkgPath, `${JSON.stringify(outputPkg, null, 2)}\n`);

console.log(
  '[postbuild] Copied patches/, drizzle/ and patchedDependencies into .mastra/output.'
);
