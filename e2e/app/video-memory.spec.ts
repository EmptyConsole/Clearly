import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

// M11 memory test (opt-in: VIDEO_MEMORY_TEST=1, several minutes): a 900 MB video generated in the
// browser (never committed) goes through the real export pipeline while the total resident memory
// of every Playwright Chromium process is sampled. Results go in docs/perf.txt.

const MB = 1024 * 1024;

/** Total resident memory (MB) of the Playwright browser processes. */
function browserRssMb(): number {
  const out = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' });
  let kb = 0;
  for (const line of out.split('\n')) {
    if (!line.includes('ms-playwright')) continue;
    const n = Number.parseInt(line.trim().split(/\s+/)[0] ?? '0', 10);
    if (Number.isFinite(n)) kb += n;
  }
  return kb / 1024;
}

test('memory: a 900 MB video exports within the WebAssembly limits', async ({ baseURL }) => {
  test.skip(!process.env['VIDEO_MEMORY_TEST'], 'opt-in: set VIDEO_MEMORY_TEST=1');
  test.setTimeout(30 * 60_000);
  // A normal (persistent) profile: Playwright's default contexts are incognito-like, with a small
  // storage quota that a 900 MB file does not fit in.
  const profileDir = await mkdtemp(join(tmpdir(), 'clearly-mem-'));
  const launch = () =>
    chromium.launchPersistentContext(profileDir, {
      baseURL: baseURL ?? 'http://localhost:4173',
      args: ['--disable-audio-output', '--autoplay-policy=no-user-gesture-required'],
    });
  // Generate the fixture into OPFS, then close the browser so none of the generator's memory is
  // counted; the same profile keeps the file.
  let context = await launch();
  let page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/');
  await page.waitForFunction(() => window.__clearlyVideo !== undefined);
  const fixture = await page.evaluate(() => window.__clearlyVideo?.makeLargeFixture(900));
  if (!fixture) throw new Error('no fixture');
  console.log(`fixture: ${(fixture.bytes / MB).toFixed(0)} MB, ${fixture.seconds} s`);
  await context.close();
  context = await launch();
  page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/');
  await page.waitForFunction(() => window.__clearlyVideo !== undefined);
  // The core is cached; load it once so the measured run starts warm, then settle.
  await page.evaluate(() => window.__clearlyVideo?.run([], ['-hide_banner', '-version']));
  await page.waitForTimeout(3000);
  const baseline = browserRssMb();
  let peak = baseline;
  const timer = setInterval(() => {
    peak = Math.max(peak, browserRssMb());
  }, 250);
  try {
    const r = await page.evaluate(() => window.__clearlyVideo?.exportLarge());
    if (!r) throw new Error('no result');
    console.log(
      `export: ${(r.bytes / MB).toFixed(0)} MB ${r.container} in ${r.seconds.toFixed(1)} s; ` +
        `browser memory baseline ${baseline.toFixed(0)} MB, peak ${peak.toFixed(0)} MB ` +
        `(+${(peak - baseline).toFixed(0)} MB)`,
    );
    expect(r.container).toBe('mp4');
    expect(r.bytes).toBeGreaterThan(fixture.bytes * 0.9);
    // Replaces this section at the end of docs/perf.txt (the audio perf spec keeps it).
    const perfUrl = new URL('../../docs/perf.txt', import.meta.url);
    const previous = existsSync(perfUrl) ? readFileSync(perfUrl, 'utf8') : '';
    const at = previous.indexOf('VIDEO EXPORT MEMORY');
    const head = (at >= 0 ? previous.slice(0, at) : previous).replace(/\n*$/, '\n\n');
    const version = await page.evaluate(() => navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]);
    writeFileSync(
      perfUrl,
      head +
        [
          'VIDEO EXPORT MEMORY (M11; e2e/app/video-memory.spec.ts with VIDEO_MEMORY_TEST=1)',
          `Date: ${new Date().toISOString()}; ${version ?? 'Chromium'}; normal (persistent) profile`,
          `  input: ${(fixture.bytes / MB).toFixed(0)} MB H.264 720p + AAC MP4, ${fixture.seconds} s (generated, never committed)`,
          `  output: ${(r.bytes / MB).toFixed(0)} MB MP4 in ${r.seconds.toFixed(1)} s (render plus mux)`,
          `  browser memory (resident, all Playwright Chromium processes): baseline ${baseline.toFixed(0)} MB, peak ${peak.toFixed(0)} MB, +${(peak - baseline).toFixed(0)} MB`,
          "  Where it goes: the output is written in ffmpeg's memory file system (it grows in steps, so",
          '  briefly about 1.1x the file), moved to the page without a copy, then copied once into a',
          '  Blob. The input video and the temporary WAV are read in place (WORKERFS, OPFS).',
          '',
        ].join('\n'),
    );
  } finally {
    clearInterval(timer);
    await page.evaluate(() => window.__clearlyVideo?.removeLarge()).catch(() => undefined);
    await context.close();
    await rm(profileDir, { recursive: true, force: true });
  }
});
