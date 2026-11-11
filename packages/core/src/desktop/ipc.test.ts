import { describe, expect, it } from 'vitest';
import {
  DESKTOP_CHANNELS,
  DESKTOP_CHANNEL_NAMES,
  ipcName,
  isSameDevice,
  isVirtualCableLabel,
} from './ipc.ts';

describe('desktop IPC schemas', () => {
  it('lists exactly the allowlisted channels', () => {
    expect(DESKTOP_CHANNEL_NAMES.sort()).toEqual(
      [
        'getVersion',
        'saveFile',
        'openFile',
        'showFloatingCaptions',
        'updateCaptionText',
        'hideFloatingCaptions',
        'setTrayState',
        'writeBackup',
        'revealBackup',
        'getLoopbackSupport',
        'setGlobalShortcut',
      ].sort(),
    );
    expect(ipcName('saveFile')).toBe('clearly:saveFile');
  });

  it('saveFile takes a plain name and bytes, nothing else', () => {
    const s = DESKTOP_CHANNELS.saveFile.request;
    const data = new Uint8Array([1, 2, 3]);
    expect(
      s.safeParse({ suggestedName: 'a (Clearly).wav', mimeType: 'audio/wav', data }).success,
    ).toBe(true);
    expect(s.safeParse({ suggestedName: '../../etc/passwd', mimeType: 'x', data }).success).toBe(
      false,
    );
    expect(s.safeParse({ suggestedName: 'a\\b.wav', mimeType: 'x', data }).success).toBe(false);
    expect(s.safeParse({ suggestedName: 'a.wav', mimeType: 'x', data: [1, 2] }).success).toBe(
      false,
    );
    expect(s.safeParse({ suggestedName: 'a.wav', mimeType: 'x', data, extra: 1 }).success).toBe(
      false,
    );
  });

  it('caption text, tray state, backup and shortcut payloads are bounded', () => {
    expect(
      DESKTOP_CHANNELS.updateCaptionText.request.safeParse({ text: 'x'.repeat(2001), final: true })
        .success,
    ).toBe(false);
    expect(
      DESKTOP_CHANNELS.setTrayState.request.safeParse({ mode: 'loud', active: true }).success,
    ).toBe(false);
    expect(DESKTOP_CHANNELS.writeBackup.request.safeParse({ json: 1 }).success).toBe(false);
    expect(
      DESKTOP_CHANNELS.setGlobalShortcut.request.safeParse({ accelerator: null }).success,
    ).toBe(true);
    expect(DESKTOP_CHANNELS.getVersion.request.safeParse({ a: 1 }).success).toBe(false);
  });
});

describe('virtual cable detection', () => {
  it.each([
    'BlackHole 2ch',
    'CABLE Output (VB-Audio Virtual Cable)',
    'CABLE Input (VB-Audio Virtual Cable)',
    'VB-Cable',
    'Loopback Audio',
    'Soundflower (2ch)',
    'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)',
  ])('recognises %s', (label) => {
    expect(isVirtualCableLabel(label)).toBe(true);
  });

  it.each(['MacBook Pro Microphone', 'AirPods Pro', 'Cable Car Headset Mic', 'Default', ''])(
    'does not flag %s',
    (label) => {
      expect(isVirtualCableLabel(label)).toBe(false);
    },
  );
});

describe('same-device refusal', () => {
  it('refuses the two ends of one cable', () => {
    expect(isSameDevice({ label: 'BlackHole 2ch' }, { label: 'BlackHole 2ch' })).toBe(true);
    expect(
      isSameDevice(
        { label: 'CABLE Output (VB-Audio Virtual Cable)' },
        { label: 'CABLE Input (VB-Audio Virtual Cable)' },
      ),
    ).toBe(true);
    expect(isSameDevice({ groupId: 'g1', label: 'A' }, { groupId: 'g1', label: 'B' })).toBe(true);
  });

  it('allows a cable in and real headphones out', () => {
    expect(isSameDevice({ label: 'BlackHole 2ch' }, { label: 'AirPods Pro' })).toBe(false);
    expect(
      isSameDevice({ label: 'MacBook Pro Microphone' }, { label: 'MacBook Pro Speakers' }),
    ).toBe(false);
    expect(isSameDevice({ groupId: 'g1', label: 'X' }, { groupId: 'g2', label: 'Y' })).toBe(false);
  });
});
