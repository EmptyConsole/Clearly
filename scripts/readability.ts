// Readability check (M10): Flesch-Kincaid grade for every string in the copy file. Prints the
// strings above grade 9 (for docs/STATUS.txt) and the share at or under grade 7.
// Run: node scripts/readability.ts

import { en } from '../apps/web/src/copy/en.ts';

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const v = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, v?.length ?? 1);
}

export function fkGrade(text: string): number | null {
  const clean = text.replace(/\{\w+\}/g, 'it');
  const words = clean.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  // Grades are meaningless for labels; judge sentences of 8 words or more.
  if (words.length < 8) return null;
  const sentences = Math.max(1, (clean.match(/[.?:;]+(\s|$)/g) ?? []).length);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

const rows: { id: string; grade: number }[] = [];
for (const [id, text] of Object.entries(en) as [string, string][]) {
  const grade = fkGrade(text);
  if (grade !== null) rows.push({ id, grade });
}
const over = rows.filter((r) => r.grade > 9).sort((a, b) => b.grade - a.grade);
const atOrUnder7 = rows.filter((r) => r.grade <= 7).length;
console.log(
  `${rows.length} sentences scored; ${atOrUnder7} (${Math.round((100 * atOrUnder7) / rows.length)} percent) at or under grade 7; ${over.length} over grade 9.`,
);
for (const r of over) console.log(`  ${r.grade.toFixed(1)}  ${r.id}`);
