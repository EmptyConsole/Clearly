import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

async function playDemo(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '60 to 69' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__clearlyPlayer?.graph))).toBe(true);
}

test('Background cleanup: download on first use, then it processes and shows voice activity', async ({
  page,
}) => {
  await playDemo(page);
  await expect(page.getByText(/needs a one-time download of 0\.1\d MB/)).toBeVisible();
  await page.getByRole('switch', { name: 'Background cleanup' }).click();
  await expect(page.getByText(/Background cleanup: Medium \(60 percent\)/)).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window.__clearlyPlayer?.graph as unknown as {
              capabilities: { backgroundCleanup: boolean };
            } | null
          )?.capabilities.backgroundCleanup,
      ),
    )
    .toBe(true);
  await expect(page.getByText(/Voice detected|No voice right now/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  // It is cached: a reload needs no new download.
  await page.reload();
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText(/needs a one-time download/)).toHaveCount(0);
});

test('Background cleanup: a failed download explains itself and the player keeps working', async ({
  page,
}) => {
  await page.route('**/heavy/rnnoise/**', (r) => r.fulfill({ status: 404, body: 'missing' }));
  await playDemo(page);
  await page.getByRole('switch', { name: 'Background cleanup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Background cleanup could not be downloaded' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText('Now hearing: Enhanced')).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('Night mode switches on, changes level and off during playback', async ({ page }) => {
  await playDemo(page);
  await page.getByRole('switch', { name: 'Night mode' }).click();
  // Scoped: Auto Boost's Sensitivity also has a Medium choice (M09).
  const nightLevel = page.getByRole('group', { name: 'How much' });
  await expect(nightLevel.getByRole('radio', { name: 'Medium' })).toBeChecked();
  await nightLevel.getByText('Strong', { exact: true }).click();
  await expect(nightLevel.getByRole('radio', { name: 'Strong' })).toBeChecked();
  const level = await page.evaluate(
    () =>
      (window.__clearlyPlayer?.graph as unknown as { plan: { nightLevel: string | null } } | null)
        ?.plan.nightLevel,
  );
  expect(level).toBe('high');
  await page.getByRole('switch', { name: 'Night mode' }).click();
  await expect(page.getByRole('radio', { name: 'Strong' })).toHaveCount(0);
  // The Night preset chip turns it on at Medium.
  await page.getByText('Night', { exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Night mode' })).toBeChecked();
  await expectNoSeriousA11yIssues(page);
});
