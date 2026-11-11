import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/**
 * Installs the test-build hooks before any page script runs: a deterministic listener with a
 * sloping high-pitch loss, a calibration answer at -30 dBFS, and a shortened time scale.
 */
export async function scriptListener(page: Page, options: { timeScale?: number } = {}) {
  await page.addInitScript((timeScale) => {
    const offset: Record<number, number> = {
      250: 9,
      500: 3,
      1000: 0,
      2000: -3,
      3000: -4,
      4000: -5,
      6000: 4,
      8000: 13,
    };
    const loss: Record<number, number> = {
      250: 0,
      500: 0,
      1000: 0,
      2000: 5,
      3000: 15,
      4000: 25,
      6000: 35,
      8000: 45,
    };
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = {
      timeScale,
      calibrationLevelDbfs: -30,
      responder: (trial: { kind: string; hz?: number; levelRelLc?: number }) =>
        trial.kind === 'tone' &&
        (trial.levelRelLc ?? -99) >=
          -45 + (offset[trial.hz ?? 0] ?? 0) + (loss[trial.hz ?? 0] ?? 0),
    };
  }, options.timeScale ?? 0.25);
}
