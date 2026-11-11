// Design review captures (M03, M05, M10, M14). Starts nothing itself: run the web dev server with
// VITE_TEST_HOOKS=1 on port 4173 first (pnpm test:e2e does). Screenshots go to research/review/
// (gitignored). Usage: node scripts/review/capture.ts <label> <path...>
import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env['REVIEW_BASE'] ?? 'http://localhost:4173';
const WIDTHS = [1440, 1024, 390] as const;
const THEMES = ['light', 'dark'] as const;
const [label = 'review', ...paths] = process.argv.slice(2);
const out = join('research', 'review', label);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

async function prepare(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = {
      timeScale: 0.2,
      calibrationLevelDbfs: -30,
      responder: (t: { kind: string; hz?: number; levelRelLc?: number }) =>
        t.kind === 'tone' && (t.levelRelLc ?? -99) >= -45 + ((t.hz ?? 0) >= 3000 ? 25 : 0),
    };
  });
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      colorScheme: theme,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    for (const path of paths) {
      await prepare(page, path);
      const name = `${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${width}-${theme}.png`;
      await page.screenshot({ path: join(out, name), fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`Saved to ${out}`);
