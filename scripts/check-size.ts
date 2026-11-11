// pnpm check:size: fails if the app shell's initial JavaScript (the entry chunk plus every chunk
// it imports statically) exceeds 250 KB gzipped. Reads the Vite build manifest, so run
// `pnpm build` first. Dynamically imported chunks are excluded by design.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';

const LIMIT_BYTES = 250 * 1000;
const DIST = 'apps/web/dist';
const MANIFEST = join(DIST, '.vite/manifest.json');

const Chunk = z.object({
  file: z.string(),
  isEntry: z.boolean().optional(),
  imports: z.array(z.string()).optional(),
});
const Manifest = z.record(z.string(), Chunk);

if (!existsSync(MANIFEST)) {
  console.error(`check:size: ${MANIFEST} not found. Run \`pnpm build\` first.`);
  process.exit(1);
}

const manifest = Manifest.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')));
const entries = Object.entries(manifest).filter(([, c]) => c.isEntry === true);
if (entries.length === 0) {
  console.error('check:size: the Vite manifest has no entry chunk.');
  process.exit(1);
}

const initial = new Set<string>();
const visit = (key: string): void => {
  const chunk = manifest[key];
  if (!chunk || initial.has(chunk.file)) return;
  if (chunk.file.endsWith('.js')) initial.add(chunk.file);
  for (const dep of chunk.imports ?? []) visit(dep);
};
for (const [key] of entries) visit(key);

let total = 0;
for (const file of initial) {
  const gz = gzipSync(readFileSync(join(DIST, file))).length;
  total += gz;
  console.log(`  ${file}: ${(gz / 1000).toFixed(1)} KB gzipped`);
}
const verdict = total <= LIMIT_BYTES ? 'within' : 'OVER';
console.log(
  `check:size: initial JavaScript ${(total / 1000).toFixed(1)} KB gzipped, ${verdict} the ${LIMIT_BYTES / 1000} KB limit.`,
);
if (total > LIMIT_BYTES) process.exit(1);
