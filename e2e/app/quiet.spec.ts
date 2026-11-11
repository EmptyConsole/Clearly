// M09: Quiet Lab (landing page, Hum Filter in Clear Audio, Auto Boost, Calm Sounds).
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yIssues } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

async function quickStart(page: Page, hooks: Record<string, unknown> = {}) {
  await page.addInitScript((h) => {
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = {
      calibrationLevelDbfs: -30,
      ...h,
    };
  }, hooks);
  await page.goto('/check/starter');
  await page.getByRole('button', { name: '70 to 79' }).click();
  await expect(page.getByRole('heading', { name: 'Your starting sound is ready' })).toBeVisible();
}

async function openDemo(page: Page) {
  await page.goto('/audio');
  const noProfile = page.getByRole('button', { name: 'Listen without a profile' });
  const open = page.getByRole('button', { name: 'Open' });
  await noProfile.or(open).first().waitFor();
  if (await noProfile.isVisible()) await noProfile.click();
  await open.click();
  await expect(page.getByRole('heading', { name: 'Clear Audio', level: 1 })).toBeVisible();
}

test('Quiet Lab lists three tools with their limits and explains each, and passes axe', async ({
  page,
}) => {
  await page.goto('/quiet');
  await expect(page.getByRole('heading', { name: 'Quiet Lab', level: 1 })).toBeVisible();
  for (const name of ['Hum Filter', 'Auto Boost', 'Calm Sounds'])
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  await expect(page.getByText('It does not remove noise in your room.')).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'What does this do?' }).first().click();
  await expect(page.getByText(/finds that hum and its overtones/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.keyboard.press('Escape');
  await expect(page.getByText(/finds that hum and its overtones/)).toBeHidden();
  await expect(page.locator('body')).not.toContainText(/experimental/i);
});

test('Hum Filter Auto finds the 60 Hz hum in the demo with hum and removes it', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await quickStart(page);
  await openDemo(page);
  await page.getByRole('button', { name: 'Hear the demo with hum' }).click();
  await expect(page.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('hum-readout')).toHaveText(
    /Removing hum at (59\.\d|60|60\.\d) Hz and 5 harmonics/,
    { timeout: 30_000 },
  );
  const plan = await page.evaluate(
    () =>
      window.__clearlyPlayer?.graph?.plan.hum.filter((n) => n.on).map((n) => n.frequencyHz) ?? [],
  );
  expect(plan.length).toBe(12);
  expect(Math.abs((plan[0] ?? 0) - 60)).toBeLessThan(0.5);
  const humGroup = page.getByRole('group', { name: 'Hum Filter setting' });
  await humGroup.getByText('50 Hz', { exact: true }).click();
  await expect(page.getByTestId('hum-readout')).toHaveText('Removing hum at 50 Hz and 5 harmonics');
  await humGroup.getByText('Off', { exact: true }).click();
  await expect(page.getByTestId('hum-readout')).toHaveText('Hum Filter is off.');
  await expectNoSeriousA11yIssues(page);
});

test('Auto Boost: headphones step, microphone pre-prompt, meter and boost readout, feedback guard', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // No profile: a flat EQ leaves room under the +24 dB summed-boost clamp for the full 6 dB.
  await page.addInitScript(() => {
    (window as unknown as { __clearlyTest: unknown }).__clearlyTest = {
      fakeMic: { levelDbfs: -70 },
    };
  });
  await page.goto('/quiet/auto-boost');
  await expect(page.getByText('Auto Boost works only while Clear Audio is playing.')).toBeVisible();
  await expect(page.getByText(/not a calibrated measurement/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await openDemo(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Turn on Auto Boost' }).click();
  await expect(page.getByRole('dialog', { name: 'Wear headphones for Auto Boost' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: "I'm wearing headphones" }).click();
  await expect(
    page.getByRole('heading', { name: 'Why Clearly needs your microphone' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Allow the microphone' }).click();
  await expect(page.getByTestId('boost-readout')).toHaveText('Currently adding +0.0 dB', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('room-meter')).toHaveAttribute('aria-valuetext', 'Quiet');

  // A noisy room: the boost rises to the full 6 dB, through core's precedence and clamp.
  await page.evaluate(() => {
    if (window.__clearlyTest) window.__clearlyTest.fakeMic = { levelDbfs: -20 };
  });
  await expect(page.getByTestId('boost-readout')).toHaveText('Currently adding +6.0 dB', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('room-meter')).toHaveAttribute('aria-valuetext', 'Very noisy');
  const plan = await page.evaluate(() => {
    const p = window.__clearlyPlayer?.graph?.plan;
    return { ambient: p?.ears.left.ambientDb ?? 0, threshold: p?.compressor.thresholdDbfs ?? 0 };
  });
  expect(plan.ambient).toBeGreaterThan(5.9);
  expect(plan.threshold).toBeLessThanOrEqual(-29.9);
  await expectNoSeriousA11yIssues(page);

  // Speakers: the microphone hears the programme, so the boost pauses.
  await page.evaluate(() => {
    if (window.__clearlyTest) window.__clearlyTest.fakeMic = 'echo';
  });
  await expect(page.getByTestId('boost-readout')).toHaveText(
    'Auto Boost paused: it can hear your show. Are you using speakers?',
    { timeout: 40_000 },
  );
  await page.getByRole('button', { name: 'Turn off Auto Boost' }).click();
  await expect(page.getByRole('button', { name: 'Turn on Auto Boost' })).toBeVisible();
});

test('Calm Sounds: pitch match, play with a sleep timer that fades and stops', async ({ page }) => {
  test.setTimeout(90_000);
  await quickStart(page, { calmSecondsPerMinute: 0.2, calmFadeSeconds: 1 });
  await page.goto('/quiet/calm');
  await expect(page.getByRole('heading', { name: 'Calm Sounds', level: 1 })).toBeVisible();
  await expect(page.getByText(/it is not a treatment\. See a doctor if ringing/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Pitch match: start at 6 kHz, one step up, then the octave check.
  await page.getByRole('button', { name: 'Start matching' }).click();
  await expect(page.getByTestId('pitch-now')).toHaveText('Tone: about 6000 Hz');
  await page.getByRole('button', { name: 'Higher' }).click();
  await expect(page.getByTestId('pitch-now')).toHaveText('Tone: about 7560 Hz');
  await page.getByRole('button', { name: 'This is close' }).click();
  await page.getByRole('button', { name: 'Play tone 1' }).click();
  await page.getByRole('button', { name: 'Tone 1', exact: true }).click();
  await expect(page.getByText('Your matched pitch: about 3780 Hz.')).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByText('Matched to my ringing', { exact: true }).click();
  await page.getByText('15 min', { exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('calm-status')).toHaveText('Playing Matched to my ringing.');
  await expect(page.getByTestId('calm-timer')).toHaveText(/Stops in 1 min/);
  // 15 "minutes" of 0.2 s each: 3 s, with a 1 s fade.
  await expect(page.getByTestId('calm-status')).toHaveText('The sleep timer stopped the sound.', {
    timeout: 10_000,
  });
});
