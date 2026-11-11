import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues, scriptListener } from '../app/helpers.ts';

// M14: the core flows docs/SUPPORT_MATRIX.txt claims for Firefox and Safari (WebKit), run on
// Playwright's Firefox and WebKit: Hearing Check, file playback, export, Calm Sounds, and the
// fallback messages where a feature is missing. Results feed SUPPORT_MATRIX.txt.
test.describe.configure({ mode: 'serial' });

function wavFixture(seconds = 8, rate = 48000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v = 0.1 * Math.sin(2 * Math.PI * 300 * t) + 0.1 * Math.sin(2 * Math.PI * 3000 * t);
    const s = Math.round(v * 32767);
    buf.writeInt16LE(s, 44 + i * 4);
    buf.writeInt16LE(s, 46 + i * 4);
  }
  return buf;
}

async function quickStart(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

async function openFile(page: Page) {
  await page.goto('/audio');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'speech.wav', mimeType: 'audio/wav', buffer: wavFixture() });
  await expect(page.getByRole('heading', { name: 'Clear Audio', level: 1 })).toBeVisible();
}

test('Hearing Check: Express with a scripted listener reaches results', async ({ page }) => {
  test.setTimeout(150_000);
  // If the audio clock never runs (no sound device), the calibration step stalls; print what the
  // browser said so a failure explains itself in the CI log.
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.log(`[${test.info().project.name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    console.log(`[${test.info().project.name}] page error: ${e.message}`);
  });
  await scriptListener(page);
  await page.goto('/check/before');
  await page.getByLabel('Which headphones are you using?').fill('Test headphones');
  await page
    .getByText('Skip', { exact: true })
    .click()
    .catch(() => undefined);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Play the tone' }).click();
  await expect(page.getByRole('heading', { name: 'Listening for beeps' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible({
    timeout: 120_000,
  });
  await expectNoSeriousA11yIssues(page);
});

test('Clear Audio: a file plays through the graph, Original | Enhanced switches', async ({
  page,
}) => {
  await quickStart(page);
  await openFile(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  await page.getByText('Original', { exact: true }).click();
  await expect(page.getByText(/Now hearing: Original/)).toBeVisible();
  await page.getByText('Enhanced', { exact: true }).click();
  await expect(page.getByText(/Now hearing: Enhanced/)).toBeVisible();
});

test('export: a WAV copy of the right length', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await quickStart(page);
  await openFile(page);
  await page.getByRole('button', { name: 'Save enhanced copy' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Make the copy' }).click();
  await expect(dialog.getByText('Your copy is ready.')).toBeVisible({ timeout: 90_000 });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const file = await download;
  // WebKit on Linux replaces spaces in download names with underscores; the app names the file
  // "speech (Clearly).wav" (download attribute), which other engines keep.
  expect(file.suggestedFilename()).toMatch(/^speech[ _]\(Clearly\)\.wav$/);
  const bytes = await readFile(await file.path());
  // 16-bit stereo 48 kHz: 192000 bytes a second, 8 s, plus the 44-byte header.
  expect(Math.abs((bytes.length - 44) / 192000 - 8)).toBeLessThan(0.05);
});

test('Calm Sounds plays and stops', async ({ page }) => {
  await quickStart(page);
  await page.goto('/quiet/calm');
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await expect(page.getByRole('button', { name: /^Stop/ }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /^Stop/ }).first().click();
  await expect(page.getByRole('button', { name: /^Play/ }).first()).toBeVisible();
});

test('fallbacks: what this browser lacks is explained, never a dead end', async ({ page }) => {
  await quickStart(page);
  const caps = await page.evaluate(() => ({
    displayMedia: 'getDisplayMedia' in navigator.mediaDevices,
    tabAudio:
      (navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean | undefined>)[
        'suppressLocalAudioPlayback'
      ] === true,
    pip: 'documentPictureInPicture' in window,
    sinkId: 'setSinkId' in AudioContext.prototype,
    savePicker: 'showSaveFilePicker' in window,
    webgpu: 'gpu' in navigator,
    webcodecs: typeof AudioDecoder !== 'undefined',
    audioSession: 'audioSession' in navigator,
  }));
  console.log(`CAPS ${test.info().project.name} ${JSON.stringify(caps)}`);
  await page.goto('/audio');
  if (!caps.tabAudio) {
    // getDisplayMedia may exist, but without tab audio the option would be a dead end: the card
    // explains and offers the desktop app or a file.
    await expect(page.getByTestId('no-tab')).toBeVisible();
    await expect(page.getByText(/use the Clearly desktop app, or open a file/)).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Choose a tab' })).toBeVisible();
  }
  await openFile(page);
  if (!caps.pip) {
    await expect(page.getByRole('button', { name: /floating/i })).toHaveCount(0);
  }
});
