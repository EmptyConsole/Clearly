import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { allCapabilities, fakePlatform, renderApp } from '../test/fakes.tsx';
import { WebPlatformAdapter } from '../platform/web.ts';
import {
  isCancel,
  NoAudioSharedError,
  startTabCapture,
  DISPLAY_MEDIA_OPTIONS,
} from './tabCapture.ts';

function fakeTrack(kind: 'audio' | 'video', settings: Record<string, unknown> = {}, label = '') {
  return {
    kind,
    label,
    stop: vi.fn(),
    getSettings: () => settings,
    addEventListener: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[]) {
  const list = [...tracks];
  return {
    getVideoTracks: () => list.filter((t) => t.kind === 'video'),
    getAudioTracks: () => list.filter((t) => t.kind === 'audio'),
    getTracks: () => [...list],
    removeTrack: (t: MediaStreamTrack) => {
      list.splice(list.indexOf(t), 1);
    },
  } as unknown as MediaStream;
}

describe('tab capture', () => {
  it('asks for tab audio with processing off and the video stopped at once', async () => {
    const video = fakeTrack('video', {}, 'My video - Streaming');
    const stopSpy = vi.spyOn(video, 'stop');
    const audio = fakeTrack('audio', { suppressLocalAudioPlayback: true });
    const getDisplayMedia = vi.fn().mockResolvedValue(fakeStream([video, audio]));
    const r = await startTabCapture({ getDisplayMedia } as unknown as MediaDevices);
    expect(getDisplayMedia).toHaveBeenCalledWith(DISPLAY_MEDIA_OPTIONS);
    expect(DISPLAY_MEDIA_OPTIONS.audio).toMatchObject({
      suppressLocalAudioPlayback: true,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect(DISPLAY_MEDIA_OPTIONS.selfBrowserSurface).toBe('exclude');
    expect(stopSpy).toHaveBeenCalled();
    expect(r.title).toBe('My video - Streaming');
    expect(r.suppressed).toBe(true);
    expect(r.stream.getVideoTracks()).toHaveLength(0);
  });

  it('reports no audio when the person did not share tab audio', async () => {
    const video = fakeTrack('video');
    const getDisplayMedia = vi.fn().mockResolvedValue(fakeStream([video]));
    await expect(
      startTabCapture({ getDisplayMedia } as unknown as MediaDevices),
    ).rejects.toBeInstanceOf(NoAudioSharedError);
  });

  it('treats NotAllowedError as a quiet cancel', async () => {
    const err = new DOMException('cancelled', 'NotAllowedError');
    const getDisplayMedia = vi.fn().mockRejectedValue(err);
    await startTabCapture({ getDisplayMedia } as unknown as MediaDevices).catch((e: unknown) => {
      expect(isCancel(e)).toBe(true);
    });
    expect(isCancel(new Error('other'))).toBe(false);
  });

  it('flags doubled sound when suppressLocalAudioPlayback was not applied', async () => {
    const getDisplayMedia = vi
      .fn()
      .mockResolvedValue(fakeStream([fakeTrack('audio', { suppressLocalAudioPlayback: false })]));
    const r = await startTabCapture({ getDisplayMedia } as unknown as MediaDevices);
    expect(r.suppressed).toBe(false);
    expect(r.title).toBeNull();
  });
});

describe('source cards', () => {
  const profile = async () => {
    const user = userEvent.setup();
    const app = renderApp('/check/starter');
    await user.click(await screen.findByRole('button', { name: '60 to 69' }));
    await screen.findByRole('heading', { name: 'Your starting sound is ready' });
    app.unmount();
  };

  it('shows demo, file and tab where tab capture exists', async () => {
    await profile();
    const platform = fakePlatform({
      capabilities: allCapabilities({ tabAudioCapture: true }),
      listAudioSources: () =>
        Promise.resolve([
          { kind: 'demo', id: 'demo' },
          { kind: 'file', id: 'file' },
          { kind: 'tab', id: 'tab' },
        ]),
    });
    renderApp('/audio', undefined, platform);
    expect(await screen.findByRole('heading', { name: 'A browser tab' })).toBeTruthy();
    expect(screen.queryByTestId('no-tab')).toBeNull();
    expect(screen.getByTestId('file-input').getAttribute('accept')).toBe('audio/*,video/*');
  });

  it('explains the alternatives on a desktop browser without tab capture', async () => {
    await profile();
    const platform = fakePlatform({
      listAudioSources: () =>
        Promise.resolve([
          { kind: 'demo', id: 'demo' },
          { kind: 'file', id: 'file' },
        ]),
    });
    renderApp('/audio', undefined, platform);
    expect(await screen.findByTestId('no-tab')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'A browser tab' })).toBeNull();
  });

  it('offers Quick start first when there is no profile', async () => {
    renderApp('/audio');
    expect(await screen.findByRole('heading', { name: 'Set up your sound first' })).toBeTruthy();
  });

  it('the web adapter lists the tab source only with the capability', async () => {
    const env = (gdm: boolean) => ({
      navigator: {
        // A browser that shares tab audio: getDisplayMedia plus the tab-audio constraint.
        mediaDevices: gdm
          ? {
              getDisplayMedia: () => undefined,
              getSupportedConstraints: () => ({ suppressLocalAudioPlayback: true }),
            }
          : {},
      } as unknown as Navigator,
      window: { matchMedia: () => ({ matches: false }) } as unknown as Window,
      document,
    });
    expect((await new WebPlatformAdapter(env(true)).listAudioSources()).map((s) => s.kind)).toEqual(
      ['demo', 'file', 'tab'],
    );
    expect(
      (await new WebPlatformAdapter(env(false)).listAudioSources()).map((s) => s.kind),
    ).toEqual(['demo', 'file']);
  });
});
