// Bundles the server (and @clearly/core) into dist/server.js. npm dependencies stay external and
// are installed in the image (better-sqlite3 is native).
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node24',
    emptyOutDir: true,
    rolldownOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        ...Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@clearly/')),
      ],
      output: { entryFileNames: 'server.js', format: 'es' },
    },
  },
  ssr: { noExternal: ['@clearly/core'] },
});
