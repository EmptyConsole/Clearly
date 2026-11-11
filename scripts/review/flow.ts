// Design review captures of the Hearing Check stage and results (needs a scripted run).
// Run the web dev server with VITE_TEST_HOOKS=1 on port 4173 first.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env['REVIEW_BASE'] ?? 'http://localhost:4173';
const label = process.argv[2] ?? 'review';
const out = join('research', 'review', label);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 1024, 390]) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __clearlyTest: unknown }).__clearlyTest = {
        timeScale: 0.15,
        calibrationLevelDbfs: -30,
        responder: (t: { kind: string; hz?: number; levelRelLc?: number }) =>
          t.kind === 'tone' && (t.levelRelLc ?? -99) >= -45 + ((t.hz ?? 0) >= 3000 ? 25 : 0),
      };
    });
    await page.goto(`${BASE}/check/before`);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Play the tone' }).click();
    await page.getByRole('button', { name: 'Start listening' }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(out, `stage-${width}-${theme}.png`), fullPage: true });
    await page.getByRole('heading', { name: 'Your results' }).waitFor({ timeout: 90_000 });
    await page.screenshot({ path: join(out, `results-${width}-${theme}.png`), fullPage: true });
    await ctx.close();
  }
}
await browser.close();
console.log(`Saved to ${out}`);
