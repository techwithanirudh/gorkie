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
cpSync(join(root, 'drizzle'), join(outputDir, 'drizzle'), { recursive: true });
// `mastra build` writes our caret ranges into its package.json but no lockfile,
// so the `bun install` after this script resolved every range to the newest
// release. On 2026-10-03 that pulled @mastra/memory 1.35.0 against the pinned
// @mastra/core 1.66.0 and the server crash-looped on a missing
// `loadMessageHistory` export. Seeding the root lockfile makes the output
// install exactly the versions that dev runs.
cpSync(join(root, 'bun.lock'), join(outputDir, 'bun.lock'));

const outputPkgPath = join(outputDir, 'package.json');
const outputPkg = packageJsonSchema.parse(
  JSON.parse(readFileSync(outputPkgPath, 'utf8'))
);
outputPkg.patchedDependencies = rootPkg.patchedDependencies;
writeFileSync(outputPkgPath, `${JSON.stringify(outputPkg, null, 2)}\n`);

console.log(
  '[postbuild] Copied patches/, drizzle/, bun.lock and patchedDependencies into .mastra/output.'
);
