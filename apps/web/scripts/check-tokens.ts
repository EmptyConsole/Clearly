// pnpm check:tokens
// 1. Contrast of every listed colour pair in every theme (text 4.5, large text/UI/focus 3).
// 2. Ear colours distinguishable under common colour-vision deficiencies.
// 3. No raw colours or durations in components: only tokens (outside src/design/).
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTokens } from '../src/design/check.ts';
import { readContrastRules, readTokens } from '../src/design/model.ts';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const json: unknown = JSON.parse(await readFile(join(webRoot, 'src/design/tokens.json'), 'utf8'));
const { results, errors } = checkTokens(readTokens(json), readContrastRules(json));

let failed = errors.length;
for (const e of errors) console.error(`ERROR ${e}`);
for (const r of results) {
  const line = `${r.pass ? 'pass' : 'FAIL'}  ${r.theme.padEnd(8)} ${r.label.padEnd(52)} ${r.value.toFixed(2).padStart(6)} (needs ${r.required})`;
  if (r.pass) console.log(line);
  else {
    console.error(line);
    failed += 1;
  }
}

// Raw values in components. Hex colours, rgb()/hsl() and literal ms/s durations are not allowed
// in apps/web/src outside the design folder.
const RAW = [
  { re: /#[0-9a-fA-F]{3,8}\b/, what: 'hex colour' },
  { re: /\b(?:rgb|rgba|hsl|hsla|oklch)\(/, what: 'colour function' },
  { re: /\b\d+(?:\.\d+)?m?s\b(?=[^a-zA-Z]|$)/, what: 'duration' },
];
async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'design') continue;
      yield* files(full);
    } else if (/\.(tsx|css)$/.test(entry.name) && !entry.name.endsWith('.test.tsx')) yield full;
  }
}
let rawHits = 0;
for await (const file of files(join(webRoot, 'src'))) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((text, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(text)) return;
    for (const { re, what } of RAW) {
      if (re.test(text)) {
        console.error(`FAIL  raw ${what} in ${relative(webRoot, file)}:${i + 1}: ${text.trim()}`);
        rawHits += 1;
      }
    }
  });
}
failed += rawHits;

const total = results.length;
if (failed > 0) {
  console.error(
    `check:tokens: ${failed} problem(s). ${total - results.filter((r) => !r.pass).length} of ${total} checks passed.`,
  );
  process.exit(1);
}
console.log(
  `check:tokens: all ${total} contrast and colour-vision checks pass; no raw values in components.`,
);
