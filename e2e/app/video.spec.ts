import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

// M11: "Video with enhanced sound" through the real dialog, with small fixtures generated in the
// browser (WebCodecs + mediabunny; the subtitle track added with Clearly's own ffmpeg build).
// Offline renders and ffmpeg compete for CPU, so these run one at a time.
test.describe.configure({ mode: 'serial' });

type Kind = 'h264-aac-mp4' | 'vp9-opus-webm' | 'vp8-opus-webm' | 'h264-opus-subs-mkv';
const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

interface Fixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

async function makeFixture(page: Page, kind: Kind, seconds: number): Promise<Fixture> {
  await page.goto('/');
  await page.waitForFunction(() => window.__clearlyVideo !== undefined);
  const made = await page.evaluate(
    async ({ kind, seconds }) => {
      const v = window.__clearlyVideo;
      if (!v) throw new Error('no video hooks');
      const f = await v.makeFixture(kind, seconds);
      let s = '';
      for (const b of f.bytes) s += String.fromCharCode(b);
      return { name: f.name, b64: btoa(s) };
    },
    { kind, seconds },
  );
  const ext = made.name.split('.').pop() ?? '';
  return {
    name: `holiday clip.${ext}`,
    mimeType: MIME[ext] ?? 'video/mp4',
    buffer: Buffer.from(made.b64, 'base64'),
  };
}

async function quickStart(page: Page) {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

async function openVideo(page: Page, f: Fixture) {
  await page.goto('/audio');
  await page.getByTestId('file-input').setInputFiles(f);
  await expect(page.getByRole('heading', { name: 'Clear Audio', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save enhanced copy' })).toBeVisible();
}

/** Opens the dialog and, the first time, downloads the video tool through its consent step. */
async function openVideoDialog(page: Page) {
  await page.getByRole('button', { name: 'Save enhanced copy' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: 'Video with enhanced sound' })).toBeChecked();
  const download = dialog.getByRole('button', { name: /Download the video tool \(\d+\.\d MB\)/ });
  const make = dialog.getByRole('button', { name: 'Make the copy' });
  // Each test has a fresh browser cache: wait for the dialog to know whether the tool is there.
  await expect
    .poll(async () => (await download.isVisible()) || (await make.isEnabled()))
    .toBe(true);
  if (await download.isVisible()) await download.click();
  await expect(make).toBeEnabled({ timeout: 30_000 });
  return dialog;
}

const b64 = (b: Buffer) => b.toString('base64');

/** Packet sizes and MD5s of every video packet (ffmpeg -c copy -f framemd5), timestamps dropped. */
async function videoPacketHashes(page: Page, name: string, data: Buffer): Promise<string[]> {
  return page.evaluate(
    async ({ name, data }) => {
      const v = window.__clearlyVideo;
      if (!v) throw new Error('no video hooks');
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const r = await v.run(
        [{ name, bytes }],
        ['-i', `/in/${name}`, '-map', '0:v', '-c', 'copy', '-f', 'framemd5', '/v.md5'],
        '/v.md5',
      );
      if (r.code !== 0 || !r.output) throw new Error(r.log.join('\n'));
      return new TextDecoder()
        .decode(r.output)
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
          const cols = l.split(',').map((c) => c.trim());
          return `${cols[0] ?? ''} ${cols[4] ?? ''} ${cols[5] ?? ''}`;
        });
    },
    { name, data: b64(data) },
  );
}

interface Probed {
  format: string;
  title?: string;
  streams: { type: string; codec: string; language?: string; bitRate?: number }[];
}

async function probe(page: Page, name: string, data: Buffer): Promise<Probed> {
  return page.evaluate(
    async ({ name, data }) => {
      const v = window.__clearlyVideo;
      if (!v) throw new Error('no video hooks');
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const p = JSON.parse(await v.probe({ name, bytes })) as {
        format: { format_name: string; tags?: Record<string, string> };
        streams: {
          codec_type: string;
          codec_name: string;
          bit_rate?: string;
          tags?: Record<string, string>;
        }[];
      };
      return {
        format: p.format.format_name,
        ...(p.format.tags?.['title'] || p.format.tags?.['MOVIE/TITLE']
          ? { title: p.format.tags['title'] ?? p.format.tags['MOVIE/TITLE'] }
          : {}),
        streams: p.streams.map((s) => ({
          type: s.codec_type,
          codec: s.codec_name,
          ...(s.tags?.['language'] ? { language: s.tags['language'] } : {}),
          ...(s.bit_rate ? { bitRate: Number(s.bit_rate) } : {}),
        })),
      };
    },
    { name, data: b64(data) },
  );
}

/** Decodes the output's audio with ffmpeg and compares it with the offline reference render. */
async function compareAudio(page: Page, name: string, data: Buffer) {
  return page.evaluate(
    async ({ name, data }) => {
      const v = window.__clearlyVideo;
      const ref = await window.__clearlyPlayer?.reference?.();
      if (!v || !ref) throw new Error('no hooks or reference');
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const r = await v.run(
        [{ name, bytes }],
        ['-i', `/in/${name}`, '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 'wav', '/a.wav'],
        '/a.wav',
      );
      if (r.code !== 0 || !r.output) throw new Error(r.log.join('\n'));
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const out = await ctx.decodeAudioData(r.output.slice().buffer);
      const refBuf = await ctx.decodeAudioData(await ref.arrayBuffer());
      const rms = (b: AudioBuffer) => {
        let s = 0;
        const d = b.getChannelData(0);
        for (const x of d) s += x * x;
        return 10 * Math.log10(s / d.length);
      };
      return {
        outDur: out.duration,
        refDur: refBuf.duration,
        outRms: rms(out),
        refRms: rms(refBuf),
      };
    },
    { name, data: b64(data) },
  );
}

async function exportVideo(page: Page) {
  const dialog = await openVideoDialog(page);
  await expect(dialog.getByText(/About .* to make/)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Make the copy' }).click();
  await expect(dialog.getByText('Your copy is ready.')).toBeVisible({ timeout: 90_000 });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const file = await download;
  return { name: file.suggestedFilename(), data: await readFile(await file.path()) };
}

test.beforeEach(async ({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`browser: ${m.text()}`);
  });
  // Use the download path, not the native save picker.
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
});

const CASES: {
  kind: Kind;
  title: string;
  container: 'mp4' | 'mkv';
  format: RegExp;
  subtitles: string[];
}[] = [
  {
    kind: 'h264-aac-mp4',
    title: 'H.264 + AAC in MP4',
    container: 'mp4',
    format: /mp4/,
    subtitles: [],
  },
  {
    kind: 'vp9-opus-webm',
    title: 'VP9 + Opus in WebM goes to MP4',
    container: 'mp4',
    format: /mp4/,
    subtitles: [],
  },
  {
    kind: 'vp8-opus-webm',
    title: 'VP8 + Opus in WebM goes to MKV',
    container: 'mkv',
    format: /matroska/,
    subtitles: [],
  },
  {
    kind: 'h264-opus-subs-mkv',
    title: 'H.264 + SubRip subtitles in MKV goes to MP4 with mov_text',
    container: 'mp4',
    format: /mp4/,
    subtitles: ['mov_text'],
  },
];

for (const c of CASES) {
  test(`video export: ${c.title}; the video is bit-identical and the audio matches`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const f = await makeFixture(page, c.kind, 6);
    await quickStart(page);
    await openVideo(page, f);
    const out = await exportVideo(page);
    expect(out.name).toBe(`holiday clip (Clearly).${c.container}`);

    const inHashes = await videoPacketHashes(page, f.name.replace(/ /g, '_'), f.buffer);
    const outHashes = await videoPacketHashes(page, `out.${c.container}`, out.data);
    expect(inHashes.length).toBeGreaterThan(100);
    expect(outHashes).toEqual(inHashes);

    const p = await probe(page, `out.${c.container}`, out.data);
    expect(p.format).toMatch(c.format);
    expect(p.title).toBe('Clearly fixture');
    const audio = p.streams.filter((s) => s.type === 'audio');
    expect(audio.map((s) => s.codec)).toEqual(['aac']);
    expect(audio[0]?.language).toBe('eng');
    if (c.container === 'mp4') {
      expect(audio[0]?.bitRate).toBeGreaterThan(150_000);
      expect(audio[0]?.bitRate).toBeLessThan(230_000);
    }
    expect(p.streams.filter((s) => s.type === 'subtitle').map((s) => s.codec)).toEqual(c.subtitles);

    const cmp = await compareAudio(page, `out.${c.container}`, out.data);
    expect(Math.abs(cmp.outDur - cmp.refDur)).toBeLessThan(0.05);
    expect(Math.abs(cmp.outRms - cmp.refRms)).toBeLessThan(0.5);
  });
}

test('video export: Cancel stops the job and deletes the temporary files', async ({ page }) => {
  test.setTimeout(180_000);
  const f = await makeFixture(page, 'h264-aac-mp4', 40);
  await quickStart(page);
  await openVideo(page, f);
  const dialog = await openVideoDialog(page);
  await dialog.getByRole('button', { name: 'Make the copy' }).click();
  await expect(dialog.getByText('Step 1 of 2: making the enhanced sound')).toBeVisible();
  // Wait until the temporary WAV exists, then cancel.
  await expect
    .poll(() => page.evaluate(() => window.__clearlyVideo?.tempFiles() ?? []), { timeout: 30_000 })
    .toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByText('Cancelled. Nothing was saved.')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__clearlyVideo?.tempFiles() ?? []), { timeout: 10_000 })
    .toEqual([]);
  await expectNoSeriousA11yIssues(page);
});

test('video export: an oversized file offers audio-only export and says why', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = { videoMaxBytes: 1000 };
  });
  const f = await makeFixture(page, 'h264-aac-mp4', 2);
  await quickStart(page);
  await openVideo(page, f);
  await page.getByRole('button', { name: 'Save enhanced copy' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Saving video works for files up to 1 GB/)).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Video with enhanced sound' })).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: 'WAV (lossless, large)' })).toBeChecked();
  await expectNoSeriousA11yIssues(page);
});

test('video export: the download step shows the real size and passes axe', async ({ page }) => {
  const f = await makeFixture(page, 'h264-aac-mp4', 2);
  // A fresh tool cache, so the consent step shows.
  await page.evaluate(() => caches.delete('clearly-heavy-v1'));
  await quickStart(page);
  await openVideo(page, f);
  await page.getByRole('button', { name: 'Save enhanced copy' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(/one-time download of the video tool \(\d+\.\d MB\)/),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Make the copy' })).toBeDisabled();
  // LGPL: the licence and the complete source are offered from the same place as the tool.
  const href = await dialog.getByRole('link', { name: /licence and source/ }).getAttribute('href');
  expect(href).toBeTruthy();
  const index = await page.request.get(href ?? '');
  expect(index.ok()).toBe(true);
  expect(await index.text()).toContain('ffmpeg-5.1.10.tar.xz');
  const licence = await page.request.get('/heavy/ffmpeg/source/COPYING.LGPLv2.1.txt');
  expect(await licence.text()).toContain('GNU LESSER GENERAL PUBLIC LICENSE');
  await expectNoSeriousA11yIssues(page);
  await dialog.getByRole('button', { name: /Download the video tool/ }).click();
  await expect(dialog.getByRole('button', { name: 'Make the copy' })).toBeEnabled({
    timeout: 30_000,
  });
});

test.describe('on a phone', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('video export is off and says why; audio export stays', async ({ page }) => {
    const f = await makeFixture(page, 'h264-aac-mp4', 2);
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    await quickStart(page);
    await openVideo(page, f);
    await page.getByRole('button', { name: 'Save enhanced copy' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Saving video is not available on phones/)).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Video with enhanced sound' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Make the copy' })).toBeEnabled();
  });
});
