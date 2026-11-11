// Compiles src/design/tokens.json into src/design/generated/{tokens,theme}.css.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTailwindTheme, compileTokensCss } from '../src/design/compile.ts';
import { readTokens } from '../src/design/model.ts';

const designDir = join(dirname(fileURLToPath(import.meta.url)), '../src/design');
const outDir = join(designDir, 'generated');

const tokens = readTokens(JSON.parse(await readFile(join(designDir, 'tokens.json'), 'utf8')));
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'tokens.css'), compileTokensCss(tokens));
await writeFile(join(outDir, 'theme.css'), compileTailwindTheme(tokens));
console.log(`tokens: compiled ${tokens.length} tokens into src/design/generated/`);
