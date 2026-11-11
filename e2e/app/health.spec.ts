import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

/** A stand-in "digit": a short tone pattern per digit (the real recordings are not installed). */
function digitWav(d: number, rate = 48000): Buffer {
  const n = Math.round(0.45 * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v =
      0.3 * Math.sin((2 * Math.PI * (300 + 120 * d) * i) / rate) * Math.sin((Math.PI * i) / n);
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

async function withProfileAndLevel(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = {
      calibrationLevelDbfs: -30,
      trackerTimeScale: 120,
    };
  });
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '60 to 69' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

test('speech-in-noise: a full run with scripted answers, result saved, suggested settings', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.route('**/digits/*.wav', (r) => {
    const d = Number(/(\d)\.wav$/.exec(r.request().url())?.[1] ?? 0);
    return r.fulfill({ status: 200, contentType: 'audio/wav', body: digitWav(d) });
  });
  await withProfileAndLevel(page);
  await page.goto('/more/health/speech');
  await expect(page.getByRole('heading', { name: 'Set a comfortable level first' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('link', { name: 'Set a comfortable level' }).click();
  await page.getByRole('button', { name: 'Play the tone' }).click();
  await expect(page.getByRole('heading', { name: 'Speech-in-noise check' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  for (let i = 0; i < 12; i++) {
    await expect(page.getByText('Type the three numbers you heard.')).toBeVisible({
      timeout: 15_000,
    });
    const triplet = await page.evaluate(() => window.__clearlyDin?.triplet ?? [0, 0, 0]);
    // Right for the first 6, then "Not sure" once in a while, from the keyboard.
    const answer = i >= 6 && i % 2 === 0 ? ['1', '1', '1'] : triplet.map(String);
    for (const k of answer) await page.keyboard.press(k);
    if (i === 0) await expectNoSeriousA11yIssues(page);
  }
  await expect(page.getByRole('heading', { name: 'Your speech-in-noise result' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/In background noise you followed speech/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Back to Listening Health' }).click();
  await expect(page.getByText(/Last result: /)).toBeVisible();
});

test('speech-in-noise explains itself when the digit recordings are not installed', async ({
  page,
}) => {
  await withProfileAndLevel(page);
  await page.goto('/check/calibrate?next=/more/health/speech');
  await page.getByRole('button', { name: 'Play the tone' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(
    page.getByRole('heading', { name: 'This check is not available yet' }),
  ).toBeVisible();
});

test('the safe-listening tracker counts minutes during file playback', async ({ page }) => {
  test.setTimeout(90_000);
  await withProfileAndLevel(page);
  await page.goto('/check/calibrate');
  await page.getByRole('button', { name: 'Play the tone' }).click();
  await expect(page.getByRole('heading', { name: 'Listening for beeps' })).toBeVisible();
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(9000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.goto('/more/health');
  const bar = page.getByTestId('today-bar');
  await expect(bar).toHaveAttribute(
    'aria-label',
    /Today: \d+ minutes comfortable, \d+ loud, \d+ very loud/,
  );
  const label = (await bar.getAttribute('aria-label')) ?? '';
  const total = (label.match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(5);
  await expect(page.getByText(/not a measurement of sound pressure/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('history: two checks overlaid on one chart with a table and the honest note', async ({
  page,
}) => {
  await withProfileAndLevel(page);
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '80 or over' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
  await page.goto('/more/health');
  const boxes = page.getByRole('checkbox');
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await expect(page.getByRole('heading', { name: 'Two Hearing Checks compared' })).toBeVisible();
  await expect(page.getByText(/Differences can come from your headphones or volume/)).toBeVisible();
  await page
    .getByRole('region', { name: 'Two Hearing Checks compared' })
    .getByRole('button', { name: 'Show as a table' })
    .click();
  await expect(page.getByRole('columnheader', { name: /Right ear, Earlier/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});
