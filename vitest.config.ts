import { defineConfig } from 'vitest/config';

// Workspace mode: each project runs with its own environment. Packages join this list in
// the milestone that gives them tests, so no project here runs with zero tests.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scripts',
          include: ['scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      'apps/web',
      {
        test: {
          name: 'core',
          include: ['packages/core/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'server',
          include: ['apps/server/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'desktop',
          include: ['apps/desktop/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'audio',
          include: ['packages/audio/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
