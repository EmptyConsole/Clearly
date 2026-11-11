import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** packages/audio test harness (real Chromium Web Audio for e2e/audio). */
const AUDIO_PORT = 4174;
/** apps/server for e2e (in-memory database, test-only secrets). */
const API_PORT = 3101;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['audio/**', 'desktop/**', 'cross/**'],
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            // A timer-driven fake audio sink: real-time AudioContexts run at real speed whatever
            // the machine's sound device is doing (see DECISIONS, 2026-11-09 M09).
            '--disable-audio-output',
          ],
        },
      },
    },
    {
      // packages/audio: offline renders and real-time checks in Chromium. Each test sets its own
      // timeout; the 30-minute memory render is the longest (about a minute).
      name: 'audio',
      testMatch: 'audio/**/*.spec.ts',
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${AUDIO_PORT}`,
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required', '--disable-audio-output'],
        },
      },
    },
    {
      // apps/desktop: the real Electron app (e2e/desktop builds what it needs).
      name: 'desktop',
      testMatch: 'desktop/**/*.spec.ts',
      timeout: 120_000,
    },
    {
      // M14: core flows on Firefox and WebKit (docs/SUPPORT_MATRIX.txt).
      name: 'firefox',
      testMatch: 'cross/**/*.spec.ts',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          // Let Web Audio start without extra gestures in automation (Chromium's equivalent is
          // --autoplay-policy=no-user-gesture-required).
          firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false },
        },
      },
    },
    {
      name: 'webkit',
      testMatch: 'cross/**/*.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      // Test-only secrets; nothing here is used outside e2e.
      command: `node apps/server/src/main.ts`,
      env: {
        PORT: String(API_PORT),
        DATABASE_PATH: ':memory:',
        RESTORE_CODE_PEPPER: 'e2e-only-pepper-0123456789abcdef0123456789',
        PAYLOAD_ENCRYPTION_KEY: 'e2e:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        ALLOWED_ORIGINS: `http://localhost:${PORT}`,
      },
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      // The dev server is used because /design exists only in development builds. VITE_TEST_HOOKS
      // turns on the scripted-response hook (never present in production builds).
      command: `VITE_TEST_HOOKS=1 API_PORT=${API_PORT} pnpm --filter @clearly/web dev --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/design`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @clearly/audio harness --port ${AUDIO_PORT} --strictPort`,
      url: `http://localhost:${AUDIO_PORT}/`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
