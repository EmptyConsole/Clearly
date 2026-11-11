import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Manifest colours come from the design tokens (light theme). */
function token(name: string): string {
  const css = readFileSync(resolve(import.meta.dirname, 'src/design/generated/tokens.css'), 'utf8');
  const m = new RegExp(`--t-color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`token ${name} not found`);
  return m[1];
}

/** Test fixtures fetched into public/heavy/test-fixtures never ship in production builds. */
const dropTestFixtures = (): Plugin => ({
  name: 'clearly-drop-test-fixtures',
  apply: 'build',
  closeBundle() {
    rmSync(resolve(import.meta.dirname, 'dist/heavy/test-fixtures'), {
      recursive: true,
      force: true,
    });
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dropTestFixtures(),
    // PWA (M10). Registration is done by the app (pwa/PwaLayer) with registerType "prompt": a new
    // version waits for the person to press Reload, never reloading by itself. The app shell and
    // every route chunk are precached; heavy assets (/heavy/) are never precached: they live in
    // their own Cache API caches after an explicit download. Not active in development, so the
    // e2e suite (which runs on the dev server) never has a service worker.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Clearly',
        short_name: 'Clearly',
        description: 'Clearer dialogue with your own headphones.',
        lang: 'en-GB',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: token('surface'),
        theme_color: token('primary'),
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,ico,webmanifest}'],
        globIgnores: ['heavy/**', '**/*.map'],
        // The transformers.js chunk is large; it is still app code, so it is precached.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/heavy\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  // Pre-bundled up front so Vite does not reload the page when they are first imported (the MP3
  // encoder loads only on the first MP3 export).
  optimizeDeps: {
    include: [
      '@clearly/audio > mediabunny',
      '@clearly/audio > @mediabunny/mp3-encoder',
      'pdf-lib',
      '@pdf-lib/fontkit',
      'dexie',
      '@huggingface/transformers',
    ],
    // @ffmpeg/ffmpeg starts its own worker with new URL('./worker.js', import.meta.url), which
    // pre-bundling would break (the file would no longer sit next to the module).
    exclude: ['@ffmpeg/ffmpeg'],
  },
  server: {
    fs: { allow: ['../..'] },
    // The optional API (apps/server) runs on 3001 in development.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env['API_PORT'] ?? '3001'}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    // check:size reads this manifest to measure the app shell's initial JavaScript.
    manifest: true,
    sourcemap: true,
  },
});
