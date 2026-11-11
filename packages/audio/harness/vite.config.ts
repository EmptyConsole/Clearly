// Development-only page for the Playwright audio tests (e2e/audio). It loads packages/audio in
// Chromium so real Web Audio (OfflineAudioContext, AudioWorklet, Workers) runs under test.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  server: { fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
  worker: { format: 'es' },
  // Pre-bundled up front: discovering them on first MP3 export would make Vite reload the page
  // in the middle of a test.
  optimizeDeps: { include: ['mediabunny', '@mediabunny/mp3-encoder'] },
  logLevel: 'warn',
});
