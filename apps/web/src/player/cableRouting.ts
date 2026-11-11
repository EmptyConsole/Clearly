// Virtual cable (desktop app, M12): finding the devices and testing the routing. A test plays a
// quiet 1 kHz tone into the cable's output side and listens on its input side; it passes when the
// tone arrives within 2 seconds.

import { isSameDevice, isVirtualCableLabel } from '@clearly/core/desktop';
import { RAW_AUDIO } from '../platform/desktop.ts';

export interface AudioDevices {
  readonly inputs: readonly MediaDeviceInfo[];
  readonly outputs: readonly MediaDeviceInfo[];
}

/** Device labels need microphone permission: ask once (the pre-prompt explains why), then list. */
export async function listDevices(
  md: MediaDevices = navigator.mediaDevices,
): Promise<AudioDevices> {
  const probe = await md.getUserMedia({ audio: true, video: false });
  for (const t of probe.getTracks()) t.stop();
  const all = await md.enumerateDevices();
  const real = (d: MediaDeviceInfo) => d.deviceId !== 'default' && d.deviceId !== 'communications';
  return {
    inputs: all.filter((d) => d.kind === 'audioinput' && real(d)),
    outputs: all.filter((d) => d.kind === 'audiooutput' && real(d)),
  };
}

export const isCable = (d: MediaDeviceInfo): boolean => isVirtualCableLabel(d.label);

/** The output side of the cable whose input side is `input` (same groupId, or same name). */
export function cableOutputFor(
  input: MediaDeviceInfo,
  outputs: readonly MediaDeviceInfo[],
): MediaDeviceInfo | null {
  return outputs.find((o) => isSameDevice(input, o)) ?? null;
}

export const TEST_TIMEOUT_MS = 2000;
const TONE_HZ = 1000;

export async function testRouting(inputId: string, cableOutputId: string): Promise<boolean> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: inputId }, ...RAW_AUDIO },
    video: false,
  });
  const ctx = new AudioContext();
  try {
    const sink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (typeof sink.setSinkId !== 'function') return false;
    await sink.setSinkId(cableOutputId);
    const osc = new OscillatorNode(ctx, { frequency: TONE_HZ });
    const gain = new GainNode(ctx, { gain: 0.1 });
    osc.connect(gain).connect(ctx.destination);
    const analyser = new AnalyserNode(ctx, { fftSize: 2048 });
    ctx.createMediaStreamSource(stream).connect(analyser);
    osc.start();
    const bins = new Float32Array(analyser.frequencyBinCount);
    const toneBin = Math.round((TONE_HZ / (ctx.sampleRate / 2)) * bins.length);
    const t0 = performance.now();
    while (performance.now() - t0 < TEST_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 100));
      analyser.getFloatFrequencyData(bins);
      const tone = Math.max(
        bins[toneBin - 1] ?? -200,
        bins[toneBin] ?? -200,
        bins[toneBin + 1] ?? -200,
      );
      let sum = 0;
      for (const b of bins) sum += b;
      if (tone > -60 && tone - sum / bins.length > 25) return true;
    }
    return false;
  } finally {
    for (const t of stream.getTracks()) t.stop();
    await ctx.close().catch(() => undefined);
  }
}
