import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

async function quickStart(page: Page, age = '60 to 69') {
  await page.goto('/check/starter');
  await page.getByRole('button', { name: age }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

async function fastSync(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = { syncDebounceMs: 200 };
  });
}

async function turnOnSync(page: Page) {
  await page.goto('/more/settings');
  await page.getByRole('checkbox', { name: /I agree that Clearly stores/ }).click();
  await page.getByRole('button', { name: 'Turn on backup' }).click();
  await expect(page.getByText(/Backup is on/).first()).toBeVisible();
}

async function getCode(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Get a restore code' }).click();
  const code = (await page.getByTestId('restore-code').textContent()) ?? '';
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  return code;
}

async function restoreWith(page: Page, code: string) {
  await page.goto('/restore');
  await page.getByLabel('Restore code').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Find my backup' }).click();
  await expect(page.getByRole('heading', { name: 'Restore these settings?' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Your settings are restored on this device.')).toBeVisible();
}

test('profiles: save, add new headphones, and switch', async ({ page }) => {
  await quickStart(page);
  await page.goto('/more/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'I got new headphones' }).click();
  await page.getByLabel('Name of the new headphones').fill('Bedroom earbuds');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('New profile made. Set a comfortable level for it.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bedroom earbuds', level: 3 })).toBeVisible();
  // Switch back to the first profile.
  await page.getByRole('button', { name: 'Use this profile' }).click();
  await expect(page.getByRole('button', { name: 'Use this profile' })).toHaveCount(1);
  // The Hearing Check shows the selector with both.
  await page.goto('/check');
  const select = page.getByLabel('Profile and headphones');
  await expect(select.locator('option')).toHaveCount(2);
  await select.selectOption({ label: 'Bedroom earbuds (Bedroom earbuds)' });
  await page.reload();
  await expect(page.getByLabel('Profile and headphones')).toHaveValue(await select.inputValue());
});

test('backup to a file and restore it in a fresh browser', async ({ page, browser }) => {
  await quickStart(page, '70 to 79');
  await page.goto('/more/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Clearly backup \d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile(await file.path(), 'utf8');
  expect(JSON.parse(text)).toMatchObject({ kind: 'clearly-backup', schemaVersion: 1 });
  await expect(page.getByText(/Last backup:/)).toBeVisible();

  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto('/more/settings');
  await expect(p2.getByText('You do not have a profile yet.')).toBeVisible();
  await p2.getByTestId('restore-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(p2.getByRole('heading', { name: 'Restore this backup?' })).toBeVisible();
  await expect(p2.getByText(/It has 1 profiles/)).toBeVisible();
  await expectNoSeriousA11yIssues(p2);
  await p2.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(p2.getByText('Backup restored.')).toBeVisible();
  await expect(p2.getByText('Estimated').first()).toBeVisible();
  // A damaged file is refused with a reason.
  await p2.getByTestId('restore-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"kind":"clearly-backup","schemaVersion":1,"profiles":"x"}'),
  });
  await expect(p2.getByText(/damaged or from a newer version/)).toBeVisible();
  await fresh.close();
});

test('restore code moves settings to a second browser', async ({ page, browser }) => {
  await quickStart(page);
  await turnOnSync(page);
  const code = await getCode(page);
  await expectNoSeriousA11yIssues(page);
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await restoreWith(p2, code);
  await p2.goto('/');
  await expect(p2.getByText('Estimated from your age range')).toBeVisible();
  // The code works once.
  await p2.goto('/restore');
  await p2.getByLabel('Restore code').fill(code);
  await p2.getByRole('button', { name: 'Find my backup' }).click();
  await expect(p2.getByText(/That code did not work/)).toBeVisible();
  await other.close();
});

test('conflict dialog offers both versions', async ({ page, browser }) => {
  await fastSync(page);
  await quickStart(page);
  await turnOnSync(page);
  const code = await getCode(page);
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await fastSync(p2);
  await restoreWith(p2, code);

  // Device A renames and syncs first.
  await page.goto('/more/settings');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Profile name').fill('Living room');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Last backed up/)).toBeVisible();
  await page.waitForTimeout(800);

  // Device B changes from the older version: the server answers 409.
  await p2.goto('/more/settings');
  await p2.getByRole('button', { name: 'Rename' }).click();
  await p2.getByLabel('Profile name').fill('Kitchen');
  await p2.getByRole('button', { name: 'Save' }).click();
  await expect(p2.getByRole('heading', { name: 'Two versions of your settings' })).toBeVisible();
  await expectNoSeriousA11yIssues(p2);
  await p2.getByRole('button', { name: 'Use the newer one' }).click();
  await expect(p2.getByRole('heading', { name: 'Living room', level: 3 })).toBeVisible();
  await other.close();
});

test('delete cloud backup keeps local data', async ({ page }) => {
  await quickStart(page);
  await turnOnSync(page);
  const code = await getCode(page);
  await page.getByRole('button', { name: 'Delete cloud backup' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete cloud backup' }).click();
  await expect(page.getByText(/Cloud backup deleted/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn on backup' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Estimated from your age range')).toBeVisible();
  // The old code no longer works.
  await page.goto('/restore');
  await page.getByLabel('Restore code').fill(code);
  await page.getByRole('button', { name: 'Find my backup' }).click();
  await expect(page.getByText(/That code did not work/)).toBeVisible();
});

test('the app keeps working with the server down', async ({ page }) => {
  await fastSync(page);
  await quickStart(page);
  await turnOnSync(page);
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Profile name').fill('Offline name');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Not backed up yet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Offline name', level: 3 })).toBeVisible();
  // Everything else still works.
  await page.goto('/check');
  await expect(page.getByRole('heading', { name: 'Hearing Check', level: 1 })).toBeVisible();
  await page.goto('/more/feedback');
  await page.getByLabel('Your message').fill('Hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('link', { name: 'Send by email' })).toBeVisible();
  // After a reload the unsent change is tried again, and the banner returns while offline.
  await expect(page.getByText('Not backed up yet')).toBeVisible();
  // Retry succeeds once the server is back.
  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Not backed up yet')).toHaveCount(0);
});

test('share link: preview, import, and the fragment is removed', async ({ page, browser }) => {
  await quickStart(page);
  await page.goto('/more/settings');
  await page.getByRole('button', { name: 'Share my profile link' }).click();
  await expect(page.getByText(/This link contains your hearing results/)).toBeVisible();
  await page.getByRole('button', { name: 'Make the link' }).click();
  const link = await page.getByRole('textbox', { name: 'Profile link' }).inputValue();
  expect(link).toMatch(/\/share#p=/);
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(link);
  await expect(p2.getByRole('heading', { name: 'A shared Clearly profile' })).toBeVisible();
  await expect.poll(() => p2.evaluate(() => window.location.hash)).toBe('');
  await expectNoSeriousA11yIssues(p2);
  await p2.getByRole('button', { name: 'Import this profile' }).click();
  await expect(p2.getByText('Profile imported.')).toBeVisible();
  await p2.goto('/');
  await p2.goto('/share#p=not-valid');
  await expect(p2.getByText(/This link is incomplete or damaged/)).toBeVisible();
  await other.close();
});

test('privacy, feedback and restore pages pass axe', async ({ page }) => {
  for (const path of ['/more/privacy', '/more/feedback', '/restore', '/more/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  }
  await page.goto('/more/feedback');
  await page.getByLabel('Your message').fill('Clear and simple.');
  await expect(page.locator('p', { hasText: 'Clear and simple.' })).toBeVisible();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Thank you. Your message was sent.')).toBeVisible();
});
