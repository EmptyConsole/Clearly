// Design review screenshots (M10): main screens at 1440, 1024 and 390 px in light and dark.
// Opt-in: DESIGN_SHOTS=1 pnpm exec playwright test e2e/review --project=chromium
// Output: test-results/design-review/<screen>-<width>-<theme>.png (not tracked).
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env['DESIGN_SHOTS'], 'design review screenshots are opt-in');

const WIDTHS = [1440, 1024, 390];
const THEMES = ['light', 'dark'] as const;

async function withProfile(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '60 to 69' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

const SCREENS: {
  name: string;
  path: string;
  profile?: boolean;
  prep?: (p: Page) => Promise<void>;
}[] = [
  { name: 'home-new', path: '/' },
  { name: 'home', path: '/', profile: true },
  { name: 'check-pre', path: '/check/before', profile: true },
  { name: 'audio-start', path: '/audio', profile: true },
  {
    name: 'player',
    path: '/audio',
    profile: true,
    prep: async (p) => {
      await p.getByRole('button', { name: 'Open' }).click();
      await expect(p.getByRole('heading', { name: 'Clear Audio', level: 1 })).toBeVisible();
    },
  },
  { name: 'quiet', path: '/quiet' },
  { name: 'calm', path: '/quiet/calm', profile: true },
  { name: 'health', path: '/more/health', profile: true },
  { name: 'settings', path: '/more/settings', profile: true },
  { name: 'welcome', path: '/welcome' },
  // M12 and M14
  { name: 'everywhere', path: '/more/everywhere' },
  { name: 'cable', path: '/audio/cable', profile: true },
];

for (const theme of THEMES)
  for (const s of SCREENS)
    test(`${s.name} ${theme}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.addInitScript((th) => {
        localStorage.setItem('clearly-theme', th);
      }, theme);
      if (s.profile) await withProfile(page);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(s.path);
        await expect(page.locator('h1')).toBeVisible();
        if (s.prep) await s.prep(page);
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `test-results/design-review/${s.name}-${w}-${theme}.png`,
          fullPage: true,
        });
      }
    });
