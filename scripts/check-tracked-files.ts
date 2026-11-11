// Fails if any tracked (or, with --staged, any staged) file is an environment file,
// a private key, or larger than 5 MB outside assets/demo/. Reads blobs from the git
// index, so it checks exactly what would be committed.
import { execFileSync } from 'node:child_process';
import { checkFile, type Violation } from './lib/tracked-guard.ts';

const CONTENT_SCAN_LIMIT = 1024 * 1024;

function git(args: string[], input?: Buffer | string): Buffer {
  return execFileSync('git', args, { input, maxBuffer: 1024 * 1024 * 1024 });
}

function stagedPaths(): Set<string> {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8');
  return new Set(out.split('\0').filter(Boolean));
}

type Entry = { path: string; sha: string };

function indexEntries(): Entry[] {
  const out = git(['ls-files', '-s', '-z']).toString('utf8');
  return out
    .split('\0')
    .filter(Boolean)
    .flatMap((line): Entry[] => {
      const tab = line.indexOf('\t');
      const meta = line.slice(0, tab).split(' ');
      const sha = meta[1];
      // Mode 160000 is a submodule pointer, not a blob.
      if (sha === undefined || meta[0] === '160000') return [];
      return [{ path: line.slice(tab + 1), sha }];
    });
}

function sizes(entries: Entry[]): Map<string, number> {
  const result = new Map<string, number>();
  if (entries.length === 0) return result;
  const out = git(
    ['cat-file', '--batch-check=%(objectname) %(objectsize)'],
    entries.map((e) => e.sha).join('\n') + '\n',
  ).toString('utf8');
  for (const line of out.split('\n')) {
    const [sha, size] = line.split(' ');
    if (sha && size) result.set(sha, Number(size));
  }
  return result;
}

const staged = process.argv.includes('--staged');
let entries = indexEntries();
if (staged) {
  const changed = stagedPaths();
  entries = entries.filter((e) => changed.has(e.path));
}

const sizeBySha = sizes(entries);
const violations: Violation[] = [];
for (const entry of entries) {
  const size = sizeBySha.get(entry.sha) ?? 0;
  const content =
    size <= CONTENT_SCAN_LIMIT ? git(['cat-file', 'blob', entry.sha]).toString('latin1') : null;
  violations.push(...checkFile(entry.path, size, content));
}

if (violations.length > 0) {
  console.error(`Tracked-file guard found ${violations.length} problem(s):`);
  for (const v of violations) console.error(`  ${v.path}: ${v.reason}`);
  console.error('Remove these files from the index (git rm --cached <file>) and try again.');
  process.exit(1);
}
console.log(
  `Tracked-file guard: ${entries.length} ${staged ? 'staged' : 'tracked'} file(s) checked, all fine.`,
);
