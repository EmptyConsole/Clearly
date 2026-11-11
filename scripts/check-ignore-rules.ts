// Asserts the Markdown ignore rule and other key .gitignore behaviour with git check-ignore.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function isIgnored(path: string): boolean {
  try {
    // --no-index: evaluate patterns even for tracked files.
    execFileSync('git', ['check-ignore', '-q', '--no-index', path], { stdio: 'ignore' });
    return true;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return false;
    throw error;
  }
}

const failures: string[] = [];

const lines = readFileSync('.gitignore', 'utf8')
  .split('\n')
  .map((l) => l.trim());
const mdLines = lines.filter((l) => /\.md$/i.test(l));
const expected = ['*.md', '!/README.md', '!/RULES.md'];
if (JSON.stringify(mdLines) !== JSON.stringify(expected)) {
  failures.push(
    `Markdown lines must be exactly ${expected.join(', ')} in that order; found ${mdLines.join(', ')}`,
  );
} else {
  const start = lines.indexOf('*.md');
  if (lines[start + 1] !== '!/README.md' || lines[start + 2] !== '!/RULES.md') {
    failures.push('The three Markdown lines must be consecutive.');
  }
}

const mustIgnore = [
  'docs/sample/test.md',
  'apps/web/notes.md',
  'docs/README.md',
  'node_modules/x/index.js',
  '.env',
  '.env.example',
  '.env.vercel',
  'emsdk-cache/emsdk-main/upstream/emscripten/eslint.config.mjs',
  'apps/server/.env.local',
  'apps/web/public/heavy/model.onnx',
  'apps/web/dist/index.html',
  'apps/server/data/clearly.sqlite',
  'research/screens/gov-uk-1440.png',
  '.claude/settings.local.json',
];
const mustTrack = [
  'README.md',
  'RULES.md',
  'pnpm-lock.yaml',
  'docs/PLAN.txt',
  '.vscode/settings.json',
  '.vscode/extensions.json',
  'heavy-manifest.json',
];

for (const p of mustIgnore) if (!isIgnored(p)) failures.push(`expected ignored: ${p}`);
for (const p of mustTrack) if (isIgnored(p)) failures.push(`expected not ignored: ${p}`);

if (failures.length > 0) {
  console.error('Ignore-rule check failed:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Ignore-rule check: ${mustIgnore.length + mustTrack.length} paths behave as expected.`);
