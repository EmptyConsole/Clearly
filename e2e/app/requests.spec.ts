import { expect, test, type Page } from '@playwright/test';

// M14 security pass: the main flows make no request to any host other than the app's own origin
// (and its API, proxied on the same origin in development). blob: and data: URLs are local.
const ALLOWED = new Set(['localhost:4173']);

function watch(page: Page): string[] {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'blob:' || u.protocol === 'data:') return;
    if (!ALLOWED.has(u.host)) foreign.push(r.url());
  });
  return foreign;
}

test('no third-party requests across the main flows', async ({ page }) => {
  test.setTimeout(120_000);
  const foreign = watch(page);
  await page.goto('/');
  await page.goto('/welcome');
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('switch', { name: /Background cleanup/ }).click();
  await page.waitForTimeout(1500);
  for (const route of [
    '/quiet',
    '/quiet/calm',
    '/quiet/auto-boost',
    '/more/health',
    '/more/settings',
    '/more/privacy',
    '/more/feedback',
    '/more/everywhere',
    '/check/before',
  ]) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
  }
  expect(foreign).toEqual([]);
});
