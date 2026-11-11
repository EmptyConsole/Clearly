// Segmented offline renderer (M02 section 3).

import { execFileSync } from 'node:child_process';
import { call, expect, test } from './harness.ts';

test('a segmented 4-minute render matches a single pass and has clean joins', async ({
  harness,
}) => {
  test.setTimeout(120_000);
  const r = await call<{
    frames: number;
    expectedFrames: number;
    segments: number;
    residualDb: number;
    boundaries: { at: number; residualDb: number }[];
    clicks: number;
    inputClicks: number;
  }>(harness, 'segmentVsSingle', 240, 60);
  expect(r.frames).toBe(r.expectedFrames);
  expect(r.segments).toBe(4);
  expect(r.residualDb).toBeLessThan(-60);
  for (const b of r.boundaries) expect(b.residualDb).toBeLessThan(-60);
  expect(r.inputClicks).toBe(0);
  expect(r.clicks).toBe(0);
});

test('a render can be cancelled', async ({ harness }) => {
  const r = await call<{ rejected: boolean; name: string }>(harness, 'cancelRender');
  expect(r).toEqual({ rejected: true, name: 'AbortError' });
});

/** Resident memory (MB) of the browser's renderer processes, from the OS. */
function rendererRssMb(browserPid: number | undefined): number {
  if (!browserPid) return Number.NaN;
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' });
  const rows: { pid: number; ppid: number; rssKb: number; command: string }[] = [];
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]), command: m[4] ?? '' });
  }
  // Renderers are descendants of the browser process, not always its children: on Linux they
  // are started by Chromium's zygote process (found by the CI run).
  const inTree = new Set([browserPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) {
      if (!inTree.has(r.pid) && inTree.has(r.ppid)) {
        inTree.add(r.pid);
        grew = true;
      }
    }
  }
  let maxKb = 0;
  for (const r of rows) {
    if (inTree.has(r.pid) && r.command.includes('--type=renderer'))
      maxKb = Math.max(maxKb, r.rssKb);
  }
  return maxKb / 1024;
}

test('a 30-minute render streams with bounded memory', async ({ harness, browser }) => {
  test.setTimeout(600_000);
  const cdp = await harness.context().newCDPSession(harness);
  // The browser process id (a browser-level CDP session), so the renderer process can be found
  // for an OS-level resident-memory reading.
  const browserCdp = await browser.newBrowserCDPSession();
  const info = (await browserCdp.send('SystemInfo.getProcessInfo').catch(() => null)) as {
    processInfo: { type: string; id: number }[];
  } | null;
  const browserPid = info?.processInfo.find((p) => p.type === 'browser')?.id;
  // Each sample reads the heap twice: as found (includes garbage not yet collected) and after a
  // forced collection (what the renderer actually retains). The bound applies to the retained
  // figure; the raw peak and the renderer process RSS are recorded alongside.
  const samples: { progress: number; rawMb: number; heapMb: number; rssMb: number }[] = [];
  const heapMb = async () => {
    const u = (await cdp.send('Runtime.getHeapUsage')) as {
      usedSize: number;
      backingStorageSize?: number;
    };
    return (u.usedSize + (u.backingStorageSize ?? 0)) / 2 ** 20;
  };
  await harness.evaluate(() => {
    (
      window as unknown as { audioHarness: { startLongRender: (m: number) => void } }
    ).audioHarness.startLongRender(30);
  });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const rawMb = await heapMb();
    await cdp.send('HeapProfiler.collectGarbage');
    const retainedMb = await heapMb();
    const state = await harness.evaluate(
      () =>
        (
          window as unknown as {
            audioHarness: {
              longRender: {
                done: boolean;
                progress: number;
                error: string;
                frames: number;
                segments: number;
                ms: number;
              };
            };
          }
        ).audioHarness.longRender,
    );
    samples.push({
      progress: state.progress,
      rawMb,
      heapMb: retainedMb,
      rssMb: rendererRssMb(browserPid),
    });
    if (state.done) {
      expect(state.error).toBe('');
      expect(state.frames).toBe(48000 * 60 * 30);
      expect(state.segments).toBe(15);
      const summary = {
        renderSeconds: Math.round(state.ms / 100) / 10,
        peakRetainedHeapMb: Math.round(Math.max(...samples.map((s) => s.heapMb))),
        peakRawHeapMb: Math.round(Math.max(...samples.map((s) => s.rawMb))),
        peakRendererRssMb: Math.round(Math.max(...samples.map((s) => s.rssMb))),
        baselineHeapMb: Math.round(samples[0]?.heapMb ?? 0),
        samples: samples.length,
      };
      test.info().annotations.push({ type: 'memory', description: JSON.stringify(summary) });
      console.log('memory', JSON.stringify(summary));
      break;
    }
  }
  const heap = samples.map((s) => s.heapMb);
  expect(Math.max(...heap)).toBeLessThan(300);
  // No growth: compare the medians of the first and second halves (a sample can land in the
  // moment one segment's buffers are being replaced by the next, so single peaks are noisy).
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const half = Math.floor(heap.length / 2);
  expect(median(heap.slice(half))).toBeLessThan(median(heap.slice(1, half)) * 1.1 + 5);
  // Whole renderer process (page, audio buffers, V8 heap, Chromium itself), from the OS. RSS moves
  // with the OS's memory management and with other tests running in parallel, so it gets a
  // generous absolute bound (a per-segment leak reached about 1 GB here before it was fixed) and is
  // recorded in the annotation rather than checked for small growth.
  const rss = samples.map((s) => s.rssMb).filter((v) => Number.isFinite(v) && v > 0);
  expect(rss.length).toBeGreaterThan(0);
  expect(Math.max(...rss)).toBeLessThan(500);
});
