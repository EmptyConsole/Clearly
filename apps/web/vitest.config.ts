import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Component tests drive the Hearing Check through the test-build responder hook.
    env: { VITE_TEST_HOOKS: '1' },
    testTimeout: 20_000,
  },
});
