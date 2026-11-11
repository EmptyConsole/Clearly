// M10: navigation by width, first-run flow, Home dashboard, and axe on every route in every theme
// and at 200 percent text size.
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

const ROUTES = [
  '/',
  '/welcome',
  '/check',
  '/check/starter',
  '/check/before',
  '/audio',
  '/audio/cable',
  '/quiet',
  '/quiet/auto-boost',
  '/quiet/calm',
  '/more',
  '/more/health',
  '/more/settings',
  '/more/privacy',
  '/more/feedback',
  '/more/everywhere',
  '/restore',
  '/no-such-page',
];

async function setTheme(page: Page, theme: 'light' | 'dark' | 'contrast') {
  await page.addInitScript((th) => {
    localStorage.setItem('clearly-theme', th);
  }, theme);
}

for (const theme of ['light', 'dark', 'contrast'] as const) {
  test(`axe passes on every route in the ${theme} theme`, async ({ page }) => {
    test.setTimeout(180_000);
    await setTheme(page, theme);
    for (const r of ROUTES) {
      await page.goto(r);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectNoSeriousA11yIssues(page);
    }
  });
}

test('axe passes on every route at 200 percent text size, with no sideways scrolling', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const r of ROUTES) {
    await page.goto(r);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.locator('h1')).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, r).toBeLessThanOrEqual(1);
  }
});

test('navigation: sidebar at 1440, rail with tooltips at 900, bottom tabs at 390', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toHaveCount(1);
  for (const name of ['Home', 'Hearing Check', 'Clear Audio', 'Quiet Lab', 'More'])
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Get Clearly Everywhere' })).toBeVisible();
  await nav.getByRole('link', { name: 'Quiet Lab', exact: true }).click();
  await expect(page).toHaveTitle('Quiet Lab - Clearly');
  await expect(page.getByRole('heading', { name: 'Quiet Lab', level: 1 })).toBeFocused();

  await page.setViewportSize({ width: 900, height: 900 });
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail).toHaveCount(1);
  const more = rail.getByRole('link', { name: 'More' });
  await more.focus();
  await expect(more.getByText('More')).toBeVisible();
  await more.press('Enter');
  await expect(page.getByRole('heading', { name: 'More', level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs).toHaveCount(1);
  const box = await tabs.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(800);
  await tabs.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('link', { name: 'Set up my sound' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('first run: four steps, skip and resume, Quick start, hear the demo, choose how to watch', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('link', { name: 'Set up my sound' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Clearly' })).toBeVisible();
  await expect(page.getByText('Your audio never leaves your device.').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'I have a restore code' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Choose how to start' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Measure my hearing \(about \d+ seconds\)/ }),
  ).toBeVisible();
  // Skip, then resume where it stopped.
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('link', { name: 'Set up my sound' })).toBeVisible();
  await page.getByRole('link', { name: 'Set up my sound' }).click();
  await expect(page.getByRole('heading', { name: 'Choose how to start' })).toBeVisible();
  await page.getByRole('button', { name: 'Quick start (5 seconds): pick your age' }).click();
  await page.getByRole('button', { name: '60 to 69' }).click();
  await expect(page.getByRole('heading', { name: 'Hear the difference' })).toBeVisible();
  await expect(page.getByText('Which sounds clearer?')).toBeVisible();
  await page.getByRole('button', { name: 'Play the demo' }).click();
  await expect(page.getByText('Now hearing: Enhanced')).toBeVisible();
  await page.getByText('Original', { exact: true }).click();
  await expect(page.getByText('Now hearing: Original')).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Choose how you will watch' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Finish and go to Home' }).click();

  // Home is now a dashboard: Start Clear Audio first, then exactly one suggestion.
  await expect(
    page.getByRole('button', { name: /Start Clear Audio|Continue with the demo/ }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Suggested next' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Make it more accurate/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('Hear an example plays 8 seconds without, then with, and says which', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/quiet');
  await page.getByRole('button', { name: 'Hear an example' }).click();
  await expect(page.getByTestId('example-hum')).toHaveText('Playing: without Hum Filter');
  await expect(page.getByTestId('example-hum')).toHaveText('Playing: with Hum Filter', {
    timeout: 12_000,
  });
  await expect(page.getByTestId('example-hum')).toHaveText('Example finished.', {
    timeout: 12_000,
  });
});
