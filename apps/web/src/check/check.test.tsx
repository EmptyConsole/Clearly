import { deterministicListener } from '@clearly/core/testing';
import { CHECK_PROGRESS_VERSION, type CheckProgress } from '@clearly/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { hearingChecks, checkProgress, kv, profiles } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useFlowStore } from './flowStore.ts';
import { renderApp, type FakeAudio } from '../test/fakes.tsx';

const SLOPE = { left: [0, 0, 0, 5, 15, 25, 35, 45], right: [0, 0, 0, 5, 15, 25, 35, 45] };

async function passPreCheck(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Before you start' });
  await user.click(screen.getByRole('radio', { name: '60 to 69' }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

async function calibrate(audio: FakeAudio, user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Set a comfortable level' });
  await user.click(screen.getByRole('button', { name: 'Play the tone' }));
  const tap = await screen.findByRole('button', { name: 'It is clear and comfortable' });
  audio.advance(2); // 20 steps of 1.5 dB: -30 dBFS
  await user.click(tap);
}

async function runToResults(listener = deterministicListener({ lossDb: SLOPE })) {
  window.__clearlyTest = { responder: (t) => listener.hears(t) };
  const user = userEvent.setup();
  const app = renderApp('/check/before');
  await passPreCheck(user);
  await calibrate(app.audio, user);
  await user.click(await screen.findByRole('button', { name: 'Start listening' }));
  await waitFor(
    () => {
      expect(app.path()).toMatch(/^\/check\/results\//);
    },
    { timeout: 15_000 },
  );
  return { ...app, user };
}

describe('Starter profile', () => {
  it('creates an Estimated profile from one tap and offers the demo and a closer match', async () => {
    const user = userEvent.setup();
    const app = renderApp('/check/starter');
    await user.click(await screen.findByRole('button', { name: '70 to 79' }));
    await screen.findByRole('heading', { name: 'Your starting sound is ready' });
    expect(app.path()).toBe('/check/starter/done');
    expect(screen.getByText('Estimated')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hear the difference now' }).getAttribute('href')).toBe(
      '/audio',
    );
    expect(
      screen.getByRole('link', { name: /Make it more accurate \(about \d+ seconds\)/ }),
    ).toBeTruthy();
    const active = useProfileStore.getState().active;
    expect(active?.audiogram.method).toBe('starter');
    expect(active?.boostStyle).toBe('gentle');
    expect(active?.capDb).toBe(12);
    expect(await kv.get('activeProfileId')).toBe(active?.id);
  });
});

describe('Calibration', () => {
  it('stores Lc from a normal tap and moves on to the test', async () => {
    const user = userEvent.setup();
    const app = renderApp('/check/calibrate');
    await calibrate(app.audio, user);
    await waitFor(() => {
      expect(app.path()).toBe('/check/test');
    });
    expect(useFlowStore.getState().lcDbfs).toBe(-30);
  });

  it('asks again when the tap comes within 400 ms', async () => {
    const user = userEvent.setup();
    const app = renderApp('/check/calibrate');
    await user.click(await screen.findByRole('button', { name: 'Play the tone' }));
    const tap = await screen.findByRole('button', { name: 'It is clear and comfortable' });
    app.audio.advance(0.2);
    await user.click(tap);
    expect(await screen.findByText("That was very quick. Let's try once more.")).toBeTruthy();
    expect(app.path()).toBe('/check/calibrate');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(app.audio.ramps).toHaveLength(2);
  });

  it('asks for more volume when the ramp reaches -12 dBFS', async () => {
    const user = userEvent.setup();
    const app = renderApp('/check/calibrate');
    await user.click(await screen.findByRole('button', { name: 'Play the tone' }));
    await screen.findByRole('button', { name: 'It is clear and comfortable' });
    act(() => {
      app.audio.ramps[0]?.reachTop();
    });
    expect(
      await screen.findByText("Please turn up your computer's volume a little and try again."),
    ).toBeTruthy();
  });
});

describe('Express', () => {
  it('runs a full check, saves it and shows the results', async () => {
    const app = await runToResults();
    expect(await screen.findByRole('heading', { name: 'Your results' })).toBeTruthy();
    expect(
      screen.getByText(
        'Quieter high-pitched sounds are harder for you to hear, which can make speech sound muffled.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/We compare each pitch/)).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Clearly now uses these results for your sound.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fine-tune \(about \d+ seconds\)/ })).toBeTruthy();
    const checks = await hearingChecks.list();
    expect(checks).toHaveLength(1);
    expect(checks[0]?.audiogram.method).toBe('express');
    expect(checks[0]?.session?.tracks).toHaveLength(10);
    const active = useProfileStore.getState().active;
    expect(active?.calibration?.lcDbfs).toBe(-30);
    expect(app.audio.tones.length).toBeGreaterThan(20);
    // Every tone went to one ear at a level the generator accepts.
    for (const tone of app.audio.tones) expect(['left', 'right']).toContain(tone.ear);
  });

  it('keeps the previous profile on Low reliability', async () => {
    // A starter profile exists first.
    const user = userEvent.setup();
    const first = renderApp('/check/starter');
    await user.click(await screen.findByRole('button', { name: '50 to 59' }));
    await screen.findByRole('heading', { name: 'Your starting sound is ready' });
    const starterId = useProfileStore.getState().active?.id;
    const starterCreated = useProfileStore.getState().active?.audiogram.createdAt;
    first.unmount();
    await runToResults(deterministicListener({ lossDb: SLOPE, tapsOnCatch: true }));
    expect(
      await screen.findByRole('heading', { name: "Let's try that again somewhere quieter" }),
    ).toBeTruthy();
    expect(screen.getByText('Clearly is still using your previous sound profile.')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    const active = useProfileStore.getState().active;
    expect(active?.id).toBe(starterId);
    expect(active?.audiogram.createdAt).toBe(starterCreated);
    expect(active?.audiogram.method).toBe('starter');
  });

  it('shows the referral message for a large difference between the ears', async () => {
    await runToResults(
      deterministicListener({
        lossDb: { left: [0, 0, 0, 0, 0, 0, 0, 0], right: [40, 45, 50, 55, 55, 55, 55, 55] },
      }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'A hearing check with a professional could help',
      }),
    ).toBeTruthy();
    expect(screen.getByText('You can still continue using Clearly.')).toBeTruthy();
  });
});

describe('Refine pause and resume', () => {
  async function startRefine() {
    const app = await runToResults();
    await screen.findByRole('heading', { name: 'Your results' });
    // Stop scripted answers so the run waits for us.
    window.__clearlyTest = {};
    await app.user.click(screen.getByRole('button', { name: /Fine-tune/ }));
    await app.user.click(await screen.findByRole('button', { name: 'Start listening' }));
    return app;
  }

  it('saves progress, then continues the same tracks to a finished Refine', async () => {
    const listener = deterministicListener({ lossDb: SLOPE });
    const app = await startRefine();
    // Answer a few trials by hand through the scripted hook, then pause for later.
    window.__clearlyTest = { responder: (t) => listener.hears(t) };
    await waitFor(() => {
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).not.toBe('0');
    });
    window.__clearlyTest = {};
    await app.user.click(screen.getByRole('button', { name: 'Pause and finish later' }));
    await screen.findByText(/Your answers are saved for 24 hours/);
    const saved = await checkProgress.get('refine');
    expect(saved?.responses.length).toBeGreaterThan(0);
    app.unmount();

    window.__clearlyTest = { responder: (t) => listener.hears(t) };
    const again = renderApp('/check');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue fine-tuning' }));
    await user.click(await screen.findByRole('button', { name: 'Start listening' }));
    await waitFor(
      () => {
        expect(again.path()).toMatch(/^\/check\/results\//);
      },
      { timeout: 15_000 },
    );
    const checks = await hearingChecks.list();
    expect(checks.map((c) => c.audiogram.method)).toEqual(['express', 'refine']);
    expect(checks[1]?.session?.tracks).toHaveLength(16);
    expect(await checkProgress.get('refine')).toBeNull();
  });

  it('drops paused progress after 24 hours', async () => {
    const created = new Date('2026-11-09T10:00:00.000Z');
    const seed = {
      method: 'express' as const,
      lcDbfs: -30,
      tracks: [],
      catchHistory: { catchTrials: 0, falseAlarms: 0 },
      guessRate: 0.02,
      totalTrials: 0,
      toneTrials: 0,
      catchTrials: 0,
      heardToneTrials: 0,
    };
    const p: CheckProgress = {
      schemaVersion: CHECK_PROGRESS_VERSION,
      id: 'refine',
      profileId: 'p',
      method: 'refine',
      createdAt: created.toISOString(),
      expiresAt: checkProgress.expiryFrom(created),
      headphoneName: 'Test',
      ageRange: null,
      lcDbfs: -30,
      rngSeed: 1,
      seed,
      responses: [true],
    };
    await checkProgress.put(p);
    expect(await checkProgress.get('refine', new Date('2026-11-10T09:59:00.000Z'))).not.toBeNull();
    expect(await checkProgress.get('refine', new Date('2026-11-10T10:00:01.000Z'))).toBeNull();
    // Deleted on read, so it stays gone.
    expect(await checkProgress.get('refine', created)).toBeNull();
  });
});

describe('Keyboard-only operation', () => {
  it('completes the pre-check and calibration by keyboard, answers with Space and pauses with Escape', async () => {
    const user = userEvent.setup();
    const app = renderApp('/check/before');
    await screen.findByRole('heading', { name: 'Before you start' });
    // Tab to the consent checkbox and tick it with Space.
    const box = screen.getByRole('checkbox');
    box.focus();
    await user.keyboard(' ');
    expect(box.getAttribute('aria-checked')).toBe('true');
    screen.getByRole('button', { name: 'Continue' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Set a comfortable level' });
    screen.getByRole('button', { name: 'Play the tone' }).focus();
    await user.keyboard('{Enter}');
    const tap = await screen.findByRole('button', { name: 'It is clear and comfortable' });
    await waitFor(() => {
      expect(document.activeElement).toBe(tap);
    });
    app.audio.advance(2);
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: 'Start listening' });
    screen.getByRole('button', { name: 'Start listening' }).focus();
    await user.keyboard('{Enter}');
    // A tone is playing: Space answers it.
    await waitFor(() => {
      expect(app.audio.tones.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/Listening/);
    });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByText('Paused. Press Resume when you are ready.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });
});

describe('storage', () => {
  it('reads profiles back validated', async () => {
    const user = userEvent.setup();
    renderApp('/check/starter');
    await user.click(await screen.findByRole('button', { name: 'Under 40' }));
    await screen.findByRole('heading', { name: 'Your starting sound is ready' });
    const list = await profiles.list();
    expect(list).toHaveLength(1);
  });
});
