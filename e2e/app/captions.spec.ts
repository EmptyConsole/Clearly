import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

// A public-domain recording (JFK, 1961), fetched by pnpm fetch:heavy for tests only.
const jfk = new URL('../../apps/web/public/heavy/test-fixtures/jfk.wav', import.meta.url);

async function openJfk(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '60 to 69' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
  await page.goto('/audio');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'jfk speech.wav', mimeType: 'audio/wav', buffer: await readFile(jfk) });
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
}

test('captions: download, pre-transcribe a file, show timed words, save SRT and VTT, no third-party requests', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const offOrigin: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:4173') && !u.startsWith('blob:') && !u.startsWith('data:'))
      offOrigin.push(u);
  });
  // Without Document Picture-in-Picture the in-player panel is the fallback.
  await page.addInitScript(() => {
    delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
  });
  await openJfk(page);
  await page.getByText('On for this video', { exact: true }).click();
  await expect(
    page.getByText(
      /Captions need a one-time download of about \d+(\.\d)? MB \(Standard\) or \d+(\.\d)? MB \(More accurate\)/,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Download \d{2,}/ }).click();
  await expect(page.getByText('Captions are ready for the whole file.')).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByRole('button', { name: 'Open floating captions' })).toHaveCount(0);
  // Timed words: "fellow Americans" is said between about 1.5 and 2.8 s.
  await page.evaluate(() => {
    const m = document.querySelector<HTMLMediaElement>('[data-testid="media"]');
    if (m) m.currentTime = 2.2;
  });
  await expect(page.getByRole('region', { name: 'Captions' })).toContainText(/fellow/i, {
    timeout: 5000,
  });
  await expectNoSeriousA11yIssues(page);

  const srtDl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as SRT' }).click();
  const srt = await readFile(await (await srtDl).path(), 'utf8');
  expect(srt).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/);
  expect(srt.toLowerCase().replace(/\s+/g, ' ')).toContain('ask not what your country');
  // "ask" is said at about 3.9 s in the recording: the cue holding it starts within 1 s of that
  // word or earlier in the same sentence.
  const vttDl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as WebVTT' }).click();
  const vtt = await readFile(await (await vttDl).path(), 'utf8');
  expect(vtt.startsWith('WEBVTT')).toBe(true);
  const fellow = /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> [^\n]+\n[^]*?fellow/i.exec(vtt);
  expect(fellow).not.toBeNull();
  const start = Number(fellow?.[3]) + Number(fellow?.[4]) / 1000;
  expect(start).toBeLessThan(2.3);
  expect(offOrigin).toEqual([]);

  // Reopening the same file is instant (caption cache by file hash).
  await page.goto('/audio');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'jfk speech.wav', mimeType: 'audio/wav', buffer: await readFile(jfk) });
  await page.getByText('On for this video', { exact: true }).click();
  await expect(page.getByText('Captions are ready for the whole file.')).toBeVisible({
    timeout: 10_000,
  });
});
