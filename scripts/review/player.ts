// Design review captures of Clear Audio: the start screen and the player with the demo clip.
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
    await page.goto(`${BASE}/check/starter`);
    await page.getByRole('button', { name: '60 to 69' }).click();
    await page.getByRole('heading', { name: 'Your starting sound is ready' }).waitFor();
    await page.goto(`${BASE}/audio`);
    await page.getByRole('heading', { name: 'Demo clip' }).waitFor();
    await page.screenshot({ path: join(out, `audio-start-${width}-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: join(out, `audio-player-${width}-${theme}.png`),
      fullPage: true,
    });
    await ctx.close();
  }
}
await browser.close();
console.log(`Saved to ${out}`);
