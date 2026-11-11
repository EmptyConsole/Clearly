// Bundles the desktop app with esbuild: the main process as one ES module, and each preload as one
// CommonJS file (sandboxed preloads cannot require npm packages such as zod, so zod and the shared
// schemas are bundled in). Build-time configuration: CLEARLY_SERVER_URL and CLEARLY_DOWNLOAD_URL.
import { build } from 'esbuild';

const env = (name: string): string => {
  const v = process.env[name] ?? '';
  if (v !== '' && !/^https?:\/\//.test(v)) throw new Error(`${name} must be an http(s) URL`);
  return v.replace(/\/+$/, '');
};

const define = {
  __CLEARLY_SERVER_URL__: JSON.stringify(env('CLEARLY_SERVER_URL')),
  __CLEARLY_DOWNLOAD_URL__: JSON.stringify(env('CLEARLY_DOWNLOAD_URL')),
};

const common = {
  bundle: true,
  platform: 'node' as const,
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning' as const,
  define,
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/main/main.ts'],
    outfile: 'dist/main.mjs',
    format: 'esm',
  }),
  build({
    ...common,
    entryPoints: ['src/preload/preload.ts'],
    outfile: 'dist/preload.cjs',
    format: 'cjs',
    minify: true,
  }),
  build({
    ...common,
    entryPoints: ['src/preload/captionsPreload.ts'],
    outfile: 'dist/captionsPreload.cjs',
    format: 'cjs',
  }),
]);
console.log('desktop: built dist/main.mjs, dist/preload.cjs, dist/captionsPreload.cjs');
