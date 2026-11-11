import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yIssues, scriptListener } from './helpers.ts';

test.describe('Hearing Check', () => {
  test('Starter: one tap gives an Estimated profile, then the demo clip plays', async ({
    page,
  }) => {
    await page.goto('/');
    await expectNoSeriousA11yIssues(page);
    // Home's "Set up my sound" opens the first-run flow (M10); the Hearing Check is in the nav.
    await expect(page.getByRole('link', { name: 'Set up my sound' })).toHaveAttribute(
      'href',
      '/welcome',
    );
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Hearing Check' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hearing Check' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('link', { name: 'Quick start' }).click();
    await expect(page.getByRole('heading', { name: 'How old are you?' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('button', { name: '60 to 69' }).click();
    await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
    await expect(page.getByText('Estimated', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Make it more accurate \(about \d+ seconds\)/ }),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('link', { name: 'Hear the difference now' }).click();
    await expect(page.getByRole('heading', { name: 'Clear Audio', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Now hearing: Enhanced')).toBeVisible();
    await page.getByText('Original', { exact: true }).click();
    await expect(page.getByText('Now hearing: Original')).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    // The home page now shows the Estimated profile.
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByText('Estimated from your age range')).toBeVisible();
  });

  test('Express: pre-check, calibration, a scripted run, results and the PDF', async ({ page }) => {
    test.setTimeout(120_000);
    await scriptListener(page);
    await page.goto('/check/before');
    await expectNoSeriousA11yIssues(page);
    await page.getByLabel('Which headphones are you using?').fill('Test headphones');
    await page.getByText('70 to 79').click();
    await expect(page.getByText(/Slower pace is on/)).toBeVisible();
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Set a comfortable level' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('button', { name: 'Play the tone' }).click();

    // The ramp takes about 2 s to reach the scripted -30 dBFS, after the audio worklets load.
    await expect(page.getByRole('heading', { name: 'Listening for beeps' })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousA11yIssues(page);
    const slower = page.getByRole('switch', { name: 'Slower pace' });
    await expect(slower).toBeChecked();
    // Space would toggle the switch, so turn it off with a click for a faster run.
    await slower.click();
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByRole('button', { name: 'I hear it' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible({
      timeout: 100_000,
    });
    await expect(
      page.getByText(
        'Quieter high-pitched sounds are harder for you to hear, which can make speech sound muffled.',
      ),
    ).toBeVisible();
    await expect(page.getByText(/with Test headphones/)).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('button', { name: 'Show as a table' }).click();
    await expect(page.getByRole('table')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save PDF' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Clearly hearing chart \d{4}-\d{2}-\d{2}\.pdf$/);
    const path = await file.path();
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  test('computer speakers: no headphones needed; both ears are checked together', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await scriptListener(page);
    await page.goto('/check/before');
    await page.getByText('Computer speakers', { exact: true }).click();
    await expect(page.getByText(/Clearly checks both ears together/)).toBeVisible();
    await expect(page.getByText(/arm's length from the speakers/)).toBeVisible();
    // No headphones question in this mode.
    await expect(page.getByLabel('Which headphones are you using?')).toHaveCount(0);
    await page.getByText('70 to 79').click();
    await page.getByRole('checkbox').click();
    await expectNoSeriousA11yIssues(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Play the tone' }).click();
    await expect(page.getByRole('heading', { name: 'Listening for beeps' })).toBeVisible({
      timeout: 15_000,
    });
    const slower = page.getByRole('switch', { name: 'Slower pace' });
    if (await slower.isChecked()) await slower.click();
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByText('Both ears (speakers)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible({
      timeout: 100_000,
    });
    await expect(page.getByText(/with Computer speakers/)).toBeVisible();
    await expect(page.getByText(/Checked through computer speakers/)).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test('the not-found page offers a way back', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('We could not find that page');
    await page.getByRole('link', { name: 'Go to the start page' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test('no horizontal page scroll at 390 px with 200 percent text on the app routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/',
    '/check',
    '/check/starter',
    '/check/before',
    '/check/calibrate',
    '/audio',
    '/more/settings',
    '/more/privacy',
    '/more/feedback',
    '/restore',
  ]) {
    await page.goto(path);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(390);
  }
});
