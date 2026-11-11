import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { ClearlyDesktopBridge } from '../../packages/core/src/desktop/ipc.ts';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

declare global {
  interface Window {
    clearlyDesktop?: ClearlyDesktopBridge;
  }
}

// M12 desktop smoke test: the real Electron app with a test-hooks build of the web app (so the
// player's analyser can be read). Builds both first (about 30 seconds).

const ROOT = join(import.meta.dirname, '..', '..');
const WEB_TEST_BUILD = join(ROOT, 'apps', 'web', 'dist-test');

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;

/** A 6-second stereo 48 kHz WAV of shaped noise and two tones. */
function wavFixture(seconds = 6, rate = 48000): Buffer {
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
  let seed = 7;
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

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const env: NodeJS.ProcessEnv = { ...process.env, VITE_TEST_HOOKS: '1' };
  delete env['ELECTRON_RUN_AS_NODE'];
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist-test', '--emptyOutDir'], {
    cwd: join(ROOT, 'apps', 'web'),
    env,
    stdio: 'ignore',
  });
  execFileSync('node', ['scripts/build.ts'], {
    cwd: join(ROOT, 'apps', 'desktop'),
    stdio: 'ignore',
  });
  // Inherited from editors built on Electron; it would make Electron run as plain Node.
  const launchEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[0] !== 'ELECTRON_RUN_AS_NODE' && e[1] !== undefined,
    ),
  );
  app = await electron.launch({
    args: [join(ROOT, 'apps', 'desktop'), '--autoplay-policy=no-user-gesture-required'],
    env: { ...launchEnv, CLEARLY_WEB_ROOT: WEB_TEST_BUILD },
  });
});

test.afterAll(async () => {
  await app.close();
});

test('the app launches on clearly://app with the bridge and nothing more', async () => {
  const win = await app.firstWindow();
  await expect(win.locator('h1')).toBeVisible({ timeout: 30_000 });
  expect(win.url()).toMatch(/^clearly:\/\/app\//);
  const exposed = await win.evaluate(() => ({
    bridge: typeof window.clearlyDesktop,
    node: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
  }));
  expect(exposed).toEqual({ bridge: 'object', node: 'undefined', process: 'undefined' });
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    // Present at runtime but missing from Electron 45's type definitions.
    const wc = w?.webContents as
      { getLastWebPreferences(): Record<string, unknown> | null } | undefined;
    const p = wc?.getLastWebPreferences();
    return p
      ? {
          contextIsolation: p.contextIsolation,
          sandbox: p.sandbox,
          nodeIntegration: p.nodeIntegration,
          webSecurity: p.webSecurity,
        }
      : null;
  });
  expect(prefs).toEqual({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
  });
});

test('the bridge rejects invalid payloads', async () => {
  const win = await app.firstWindow();
  const r = await win.evaluate(async () => {
    const b = window.clearlyDesktop;
    if (!b) throw new Error('no bridge');
    const errors: string[] = [];
    try {
      await b.saveFile({
        suggestedName: '../../escape.txt',
        mimeType: 'text/plain',
        data: new Uint8Array([1]),
      });
    } catch (e) {
      errors.push(String(e));
    }
    try {
      await b.setTrayState({ mode: 'loud' as 'enhanced', active: true });
    } catch (e) {
      errors.push(String(e));
    }
    return { errors, version: await b.getVersion() };
  });
  expect(r.errors).toHaveLength(2);
  expect(r.errors[0]).toMatch(/invalid saveFile request/);
  expect(r.version.version).toMatch(/^\d+\.\d+\.\d+/);
});

test('Quick start, then a file plays through the graph and Original | Enhanced changes it', async () => {
  const win = await app.firstWindow();
  await win.goto('clearly://app/check/starter');
  await win.getByRole('button', { name: '70 to 79' }).click();
  await expect(win.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
  await win.goto('clearly://app/audio');
  await win
    .getByTestId('file-input')
    .setInputFiles({ name: 'speech.wav', mimeType: 'audio/wav', buffer: wavFixture() });
  await win.getByRole('button', { name: 'Play', exact: true }).click();
  const level = () =>
    win.evaluate(async () => {
      const g = window.__clearlyPlayer?.graph;
      if (!g) return -200;
      const a = g.taps.analyser;
      const d = new Float32Array(a.fftSize);
      let sum = 0;
      for (let k = 0; k < 10; k++) {
        a.getFloatTimeDomainData(d);
        for (const x of d) sum += x * x;
        await new Promise((r) => setTimeout(r, 50));
      }
      return 10 * Math.log10(sum / (d.length * 10) + 1e-12);
    });
  await expect.poll(level, { timeout: 15_000 }).toBeGreaterThan(-50);
  const enhanced = await level();
  await win.getByText('Original', { exact: true }).click();
  await expect
    .poll(async () => Math.abs((await level()) - enhanced), { timeout: 10_000 })
    .toBeGreaterThan(1);
});

test('the tray command switches the player like the global shortcut does', async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole('radio', { name: 'Original' })).toBeChecked();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('clearly:tray-command', 'toggle');
  });
  await expect(win.getByRole('radio', { name: 'Enhanced' })).toBeChecked();
});

test('the app pages carry the strict CSP, and nothing outside clearly://app is served', async () => {
  const r = await app.evaluate(async ({ net }) => {
    const page = await net.fetch('clearly://app/');
    const other = await net.fetch('clearly://evil/index.html');
    return {
      csp: page.headers.get('content-security-policy'),
      otherStatus: other.status,
    };
  });
  expect(r.csp).toContain("default-src 'self'");
  expect(r.csp).toContain("object-src 'none'");
  expect(r.csp).toMatch(/connect-src 'self' blob:(;| https?:\/\/[^;]+;)/);
  expect(r.csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(r.otherStatus).toBe(403);
});
