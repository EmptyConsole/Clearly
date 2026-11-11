import { expect, test, type Page } from '@playwright/test';

// M14: the phone behaviour from earlier milestones, on an emulated phone (touch, coarse pointer,
// 390 px). Real-device checks (wake lock, vibration, the silent switch, screen lock) are in
// docs/MANUAL_TESTS.txt.
test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

async function quickStart(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

test('bottom tab bar with safe-area padding, no sidebar or rail', async ({ page }) => {
  await page.goto('/');
  const navs = page.getByRole('navigation', { name: /./ });
  const tabBar = page.locator('nav.fixed');
  await expect(tabBar).toBeVisible();
  expect(await tabBar.getAttribute('class')).toContain('env(safe-area-inset-bottom)');
  const box = await tabBar.boundingBox();
  expect(box && box.y + box.height).toBeCloseTo(844, 0);
  // Only the tab bar is shown: the sidebar and the rail are hidden at this width.
  let visible = 0;
  for (const n of await navs.all()) if (await n.isVisible()) visible += 1;
  expect(visible).toBe(1);
});

test('the test button is larger on a phone (1.4 x the 160 px token)', async ({ page }) => {
  await page.goto('/design');
  const big = page.getByRole('button', { name: 'I hear it', exact: true });
  const w = (await big.boundingBox())?.width ?? 0;
  expect(w).toBeGreaterThanOrEqual(220);
});

test('files: the picker accepts audio and video', async ({ page }) => {
  await quickStart(page);
  await page.goto('/audio');
  await expect(page.getByTestId('file-input')).toHaveAttribute('accept', 'audio/*,video/*');
  // No tab capture on a phone, with the reason one tap away.
  await expect(page.getByRole('button', { name: 'Choose a tab' })).toHaveCount(0);
});

test('Media Session shows what is playing', async ({ page }) => {
  await quickStart(page);
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title ?? null))
    .not.toBeNull();
});

test('downloads ask first on a cellular or data-saver connection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', saveData: false, addEventListener: () => undefined },
      configurable: true,
    });
  });
  await page.evaluate(() => caches.delete('clearly-heavy-v1')).catch(() => undefined);
  await quickStart(page);
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByRole('switch', { name: /Background cleanup/ }).click();
  await expect(page.getByText(/You seem to be on mobile data or data saver/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download anyway' })).toBeVisible();
});

test('captions default to Standard', async ({ page }) => {
  await quickStart(page);
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).first().click();
  await expect(page.getByRole('combobox', { name: 'Caption quality' })).toHaveValue('standard');
});

test('the phone page: QR code, numbered steps, what works, and the reason tab sound does not', async ({
  page,
}) => {
  await page.goto('/more/everywhere');
  const qr = page.getByRole('img', { name: /QR code for http:\/\/localhost:4173/ });
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByText(/This is a development address/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'iPhone and iPad' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Android' })).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Tap Add to Home Screen.' }),
  ).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({ hasText: 'Run Quick start.' })).toHaveCount(2);
  await expect(
    page.getByText(
      'Phone browsers cannot listen to sound from other apps such as Netflix or YouTube.',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText(/Headphone Accommodations/)).toBeVisible();
  await expect(page.getByText(/Coming soon/)).toHaveCount(0);
});
