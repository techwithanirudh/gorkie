import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const packageJsonSchema = z.looseObject({
  patchedDependencies: z.record(z.string(), z.string()).optional(),
});

const root = process.cwd();
const outputDir = join(root, '.mastra/output');

const rootPkg = packageJsonSchema.parse(
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
);

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
// `migrate()` reads these at boot, so a build without them starts and then
// fails on the first query.
cpSync(join(root, 'drizzle'), join(outputDir, 'drizzle'), { recursive: true });

const outputPkgPath = join(outputDir, 'package.json');
const outputPkg = packageJsonSchema.parse(
  JSON.parse(readFileSync(outputPkgPath, 'utf8'))
);
outputPkg.patchedDependencies = rootPkg.patchedDependencies;
writeFileSync(outputPkgPath, `${JSON.stringify(outputPkg, null, 2)}\n`);

console.log(
  '[postbuild] Copied patches/, drizzle/ and patchedDependencies into .mastra/output.'
);
