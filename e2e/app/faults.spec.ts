import { expect, test, type Page } from '@playwright/test';

// M14 fault injection: heavy downloads failing (404 and a corrupt file), storage quota exceeded
// (IndexedDB and the Cache API), the system suspending the AudioContext, and headphones being
// unplugged mid-playback. The server-down case is in profiles.spec.ts.

async function quickStart(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

async function openDemo(page: Page) {
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
}

for (const fault of ['404', 'corrupt'] as const) {
  test(`a heavy download that fails (${fault}) explains itself and the player keeps going`, async ({
    page,
  }) => {
    await page.route('**/heavy/rnnoise/**', (route) =>
      fault === '404'
        ? route.fulfill({ status: 404, body: 'Not found' })
        : route.fulfill({ status: 200, body: Buffer.alloc(157234, 7) }),
    );
    await quickStart(page);
    await openDemo(page);
    await page.getByRole('switch', { name: /Background cleanup/ }).click();
    await expect(page.getByText('Background cleanup could not be downloaded')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });
}

test('the Cache API is full: the download still works for this session', async ({ page }) => {
  await page.addInitScript(() => {
    Cache.prototype.put = () =>
      Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
  });
  await quickStart(page);
  await openDemo(page);
  await page.getByRole('switch', { name: /Background cleanup/ }).click();
  await expect(page.getByRole('slider', { name: /Background cleanup|Cleanup/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Background cleanup could not be downloaded')).toHaveCount(0);
});

test('IndexedDB is full: saving says so plainly and the app keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const full = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    IDBObjectStore.prototype.put = full;
    IDBObjectStore.prototype.add = full;
  });
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByText('Your results could not be saved')).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.locator('h1')).toBeVisible();
});

test('the system suspends the sound: a banner offers to turn it back on', async ({ page }) => {
  await quickStart(page);
  await openDemo(page);
  await page.waitForFunction(() => window.__clearlyPlayer?.graph != null);
  await page.evaluate(async () => {
    // Stands in for the system: suspend the app's AudioContext from outside the app.
    await (window.__clearlyPlayer?.graph?.taps.analyser.context as AudioContext).suspend();
  });
  const banner = page.getByRole('alert').filter({ hasText: 'Your device paused the sound' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Turn the sound back on' }).click();
  await expect(banner).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__clearlyPlayer?.graph?.taps.analyser.context.state),
  ).toBe('running');
});

test('headphones unplugged mid-playback: Clearly pauses instead of using the speakers', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __outputs: string[] };
    w.__outputs = ['speakers', 'headphones'];
    const md = navigator.mediaDevices;
    md.enumerateDevices = () =>
      Promise.resolve(
        w.__outputs.map(
          (id) =>
            ({ deviceId: id, kind: 'audiooutput', label: id, groupId: id }) as MediaDeviceInfo,
        ),
      );
  });
  await quickStart(page);
  await openDemo(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { __outputs: string[] }).__outputs = ['speakers'];
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  const card = page.getByRole('alert').filter({ hasText: 'Clearly paused' });
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  // A deliberate pause is not reported as a system pause.
  await expect(page.getByText('Your device paused the sound')).toHaveCount(0);
  await card.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
