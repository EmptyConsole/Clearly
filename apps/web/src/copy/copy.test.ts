// @vitest-environment node
// Copy sweep (M10): banned words, no "!", and no literal text in JSX outside the copy file.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';

const BANNED = [
  'experimental',
  'seamless',
  'unlock',
  'empower',
  'elevate',
  'supercharge',
  'revolutionise',
  'revolutionize',
  'game-changing',
  'cutting-edge',
  'diagnose',
  'treat',
  'cure',
  'clinical',
  'reimagined',
];

/**
 * Required disclaimers that must use a banned word to say what Clearly is not. Each one is on the
 * list in docs/REGULATORY_REVIEW.txt.
 */
const ALLOW: Record<string, string> = {
  // M09 prompt: the required Calm Sounds line says sound "is not a treatment".
  'calm.required': 'treatment',
  // Quiet Lab card: Calm Sounds "is not a treatment".
  'quiet.calm.cannot': 'treatment',
};

describe('copy file', () => {
  it('uses no banned word (whole words, any case; "AI" in capitals) and no "!"', () => {
    const problems: string[] = [];
    for (const [id, text] of Object.entries(en)) {
      if (text.includes('!')) problems.push(`${id}: contains "!"`);
      if (/\bAI\b/.test(text)) problems.push(`${id}: AI`);
      for (const w of BANNED) {
        // Whole words, including simple inflections (treats, treated, treatment, cured).
        const re = new RegExp(`\\b${w.replace('-', '[- ]')}(s|d|ed|ing|ment|ments)?\\b`, 'i');
        const m = re.exec(text);
        if (!m) continue;
        const allowed = ALLOW[id];
        if (allowed && m[0].toLowerCase() === allowed) continue;
        problems.push(`${id}: ${m[0]}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every allowlisted id exists and still needs its word', () => {
    for (const [id, word] of Object.entries(ALLOW)) {
      const text = (en as Record<string, string>)[id];
      expect(text, id).toBeDefined();
      expect(text?.toLowerCase(), id).toContain(word);
    }
  });
});

const SRC = resolve(import.meta.dirname, '..');
/**
 * The developer-only /design page (tokens, contrast table, component gallery) is not part of
 * production builds and is not user-facing, so its labels may be literal.
 */
const EXEMPT_DIRS = ['design/'];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'generated' ? [] : tsxFiles(p);
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : [];
  });
}

/** Attributes whose string value is shown or spoken. */
const TEXT_ATTRS = new Set([
  'aria-label',
  'title',
  'placeholder',
  'alt',
  'label',
  'aria-description',
]);

describe('literal JSX text', () => {
  it('every visible or spoken string in components comes from the copy file', () => {
    const problems: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = relative(SRC, file);
      if (EXEMPT_DIRS.some((d) => rel.startsWith(d))) continue;
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (n: ts.Node) => {
        if (ts.isJsxText(n) && /[A-Za-z]{2,}/.test(n.text.replace(/&\w+;/g, ''))) {
          problems.push(
            `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} "${n.text.trim()}"`,
          );
        }
        if (
          ts.isJsxAttribute(n) &&
          TEXT_ATTRS.has(n.name.getText()) &&
          n.initializer &&
          ts.isStringLiteral(n.initializer) &&
          /[A-Za-z]{2,}/.test(n.initializer.text)
        ) {
          problems.push(
            `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.name.getText()}="${n.initializer.text}"`,
          );
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(problems).toEqual([]);
  });
});
