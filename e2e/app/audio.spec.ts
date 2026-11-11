import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

// Real-time playback and offline export renders compete for CPU; run these one at a time.
test.describe.configure({ mode: 'serial' });

/** A 20-second stereo 44.1 kHz WAV of shaped noise and tones (resampled to 48 kHz on export). */
function wavFixture(seconds = 20, rate = 44100): Buffer {
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
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v =
      0.08 * rnd() + 0.1 * Math.sin(2 * Math.PI * 4000 * t) + 0.1 * Math.sin(2 * Math.PI * 300 * t);
    const s = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
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

async function openFile(page: Page, name = 'speech test.wav') {
  await page.goto('/audio');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name, mimeType: 'audio/wav', buffer: wavFixture() });
  await expect(page.getByRole('heading', { name: 'Clear Audio', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
}

/** Level at 4 kHz minus level at 300 Hz (dB), from the analyser, averaged over about 1 s. */
async function tiltDb(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const g = window.__clearlyPlayer?.graph;
    if (!g) throw new Error('no graph');
    const a = g.taps.analyser;
    const d = new Float32Array(a.frequencyBinCount);
    const bin = (hz: number) => Math.round((hz / (a.context.sampleRate / 2)) * d.length);
    let hi = 0;
    let lo = 0;
    for (let k = 0; k < 20; k++) {
      a.getFloatFrequencyData(d);
      hi += d[bin(4000)] ?? -200;
      lo += d[bin(300)] ?? -200;
      await new Promise((r) => setTimeout(r, 50));
    }
    return (hi - lo) / 20;
  });
}

test('sources page lists demo, file and tab, and passes axe', async ({ page }) => {
  await quickStart(page);
  await page.goto('/audio');
  await expect(page.getByRole('heading', { name: 'Demo clip' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A file on this device' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A browser tab' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Choose a tab' }).click();
  await expect(page.getByRole('heading', { name: 'Enhance a browser tab' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('demo clip plays, and Space and H switch Original | Enhanced', async ({ page }) => {
  await quickStart(page);
  await page.goto('/audio');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('Now hearing: Enhanced')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect(page.getByText('Now hearing: Original')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Now hearing: Enhanced')).toBeVisible();
  await page.keyboard.down('h');
  await expect(page.getByText('Now hearing: Original')).toBeVisible();
  await page.keyboard.up('h');
  await expect(page.getByText('Now hearing: Enhanced')).toBeVisible();
  // K pauses.
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('file playback: Original | Enhanced changes the output level', async ({ page }) => {
  await quickStart(page);
  await openFile(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__clearlyPlayer?.graph))).toBe(true);
  await page.waitForTimeout(600);
  const enhanced = await tiltDb(page);
  await page.getByText('Original', { exact: true }).click();
  await page.waitForTimeout(400);
  const original = await tiltDb(page);
  // The 70-79 starter profile lifts 4 kHz far more than 300 Hz.
  expect(enhanced - original).toBeGreaterThan(3);
  // The meters and the chart table render.
  await page.getByText('See what Clearly is doing').click();
  await expect(page.getByRole('table', { name: /Change at each pitch/ })).toBeVisible();
  await page.getByText('Advanced', { exact: true }).click();
  await expect(
    page.locator('details', { hasText: 'Adjust each pitch' }).getByLabel(/Loudest-sound limit/),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

for (const format of ['WAV', 'MP3'] as const) {
  test(`${format} export matches the offline reference render`, async ({ page }) => {
    test.setTimeout(120_000);
    // Use the download path, not the native save picker.
    await page.addInitScript(() => {
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await quickStart(page);
    await openFile(page);
    await page.getByRole('button', { name: 'Play' }).click();
    await page
      .getByRole('button', { name: 'Play' })
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Save enhanced copy' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Built in: Movie preset/)).toBeVisible();
    await expect(dialog.getByText(/About .* to make/)).toBeVisible({ timeout: 30_000 });
    if (format === 'MP3') await dialog.getByText('MP3 (smaller)').click();
    await dialog.getByRole('button', { name: 'Make the copy' }).click();
    await expect(dialog.getByText('Your copy is ready.')).toBeVisible({ timeout: 90_000 });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`speech test (Clearly).${format.toLowerCase()}`);
    const bytes = await readFile(await file.path());
    const cmp = await page.evaluate(async (b64) => {
      const ref = await window.__clearlyPlayer?.reference?.();
      if (!ref) throw new Error('no reference');
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const out = await ctx.decodeAudioData(bin.buffer);
      const refBuf = await ctx.decodeAudioData(await ref.arrayBuffer());
      const rms = (b: AudioBuffer) => {
        let s = 0;
        const d = b.getChannelData(0);
        for (const v of d) s += v * v;
        return 10 * Math.log10(s / d.length);
      };
      return {
        outDur: out.duration,
        refDur: refBuf.duration,
        outRms: rms(out),
        refRms: rms(refBuf),
      };
    }, bytes.toString('base64'));
    expect(Math.abs(cmp.outDur - 20)).toBeLessThan(0.05);
    expect(Math.abs(cmp.outDur - cmp.refDur)).toBeLessThan(0.05);
    expect(Math.abs(cmp.outRms - cmp.refRms)).toBeLessThan(0.5);
  });
}
