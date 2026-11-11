// Shared helpers for the packages/audio Playwright tests. The harness page
// (packages/audio/harness) exposes window.audioHarness; scenarios run in Chromium and return
// plain JSON, so large buffers never cross into the test process.

import { test as base, type Page } from '@playwright/test';

type HarnessFn = (...args: unknown[]) => unknown;

export async function call<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return (await page.evaluate(
    async ({ name, args }) => {
      const h = (window as unknown as { audioHarness: Record<string, HarnessFn> }).audioHarness;
      const fn = h[name];
      if (typeof fn !== 'function') throw new Error(`no harness scenario ${name}`);
      return await fn(...args);
    },
    { name, args },
  )) as T;
}

/** A page with the harness loaded and ready. */
export const test = base.extend<{ harness: Page }>({
  harness: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForFunction(() => document.body.dataset['ready'] === 'true');
    await use(page);
  },
});

export { expect } from '@playwright/test';
