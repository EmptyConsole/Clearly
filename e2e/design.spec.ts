import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test.describe('/design token page', () => {
  test('renders every section and reports all contrast checks passing', async ({ page }) => {
    await page.goto('/design');
    await expect(page.getByRole('heading', { level: 1, name: 'Design tokens' })).toBeVisible();
    for (const name of [
      'Colour roles',
      'Contrast checks',
      'Type',
      'Spacing',
      'Motion',
      'Focus and targets',
      'Components',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.getByText(/checks pass in every theme/)).toBeVisible();
  });

  for (const theme of ['Light', 'Dark', 'High contrast'] as const) {
    test(`has no serious accessibility issues in the ${theme} theme`, async ({ page }) => {
      await page.goto('/design');
      await page.getByRole('radio', { name: theme }).check({ force: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark|contrast/);
      await expectNoSeriousA11yIssues(page);
    });
  }

  test('shows a visible focus ring at least 3 px wide', async ({ page }) => {
    await page.goto('/design');
    await page.getByRole('link', { name: /text link/ }).focus();
    const width = await page
      .getByRole('link', { name: /text link/ })
      .evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
    expect(width).toBeGreaterThanOrEqual(3);
  });

  test('has no horizontal page scroll at 390 px or at 200 percent text size', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/design');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
});

test('unknown addresses show the not-found message', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('We could not find that page');
  await expectNoSeriousA11yIssues(page);
});
