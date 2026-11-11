// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/dist-test/',
    '**/coverage/',
    'playwright-report/',
    'test-results/',
    '.lighthouseci/',
    // CI: the Emscripten SDK cache (mymindstorm/setup-emsdk) sits in the checkout.
    'emsdk-cache/',
    'research/',
    'apps/web/public/heavy/',
    'apps/web/src/design/generated/',
    // Vendored from ffmpeg.wasm 0.12.15 (MIT) and compiled into the core with --pre-js.
    'scripts/ffmpeg-wasm/bind.js',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.scripts.json',
          './apps/web/tsconfig.json',
          './apps/web/tsconfig.node.json',
          './packages/*/tsconfig.json',
          './packages/core/tsconfig.scripts.json',
          './packages/audio/tsconfig.worklet.json',
          './packages/audio/tsconfig.worker.json',
          './packages/audio/tsconfig.harness.json',
          './packages/audio/tsconfig.nodetest.json',
          './apps/{server,desktop}/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/**/*.test.tsx', 'apps/web/src/test/**'],
    ...reactRefresh.configs.vite,
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Packaging hooks (electron-builder loads them with require).
    files: ['**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
