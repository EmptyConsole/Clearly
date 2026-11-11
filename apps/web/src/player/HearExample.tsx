import type { GraphSettings, ProcessingGraph } from '@clearly/audio';
import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t, type MessageId } from '../copy/en.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { Button } from '../ui/Button.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { demoClipUrl } from './demoClip.ts';
import { playerSettings } from './settings.ts';

export type ExampleFeature = 'vf' | 'night' | 'hum';
const SEGMENT_S = 8;
/** Where in the demo clip the example starts (past the opening fade). */
const OFFSET_S = 4;

async function settingsFor(
  feature: ExampleFeature,
  base: GraphSettings,
  on: boolean,
): Promise<GraphSettings> {
  if (feature === 'vf') return { ...base, voiceFocus: on ? 0.8 : 0 };
  if (feature === 'night')
    return on ? { ...base, compressor: { kind: 'night', level: 'medium' } } : base;
  const { fixedHumNotches } = await import('@clearly/audio');
  return { ...base, hum: { enabled: on, notches: on ? fixedHumNotches(60) : [] } };
}

/**
 * "Hear an example" (M10): 8 seconds of the demo clip with the feature off, then 8 seconds with
 * it on, through the same graph Clear Audio uses, with a visible and announced label. Only on tap.
 */
export function HearExample({
  feature,
  onStart,
}: {
  feature: ExampleFeature;
  /** For example, pause the main player first. */
  onStart?: () => void;
}) {
  const profile = useProfileStore((s) => s.active);
  const [phase, setPhase] = useState<'idle' | 'off' | 'on' | 'done' | 'failed'>('idle');
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stopRef.current?.();
    },
    [],
  );
  const name = t(`example.${feature}` as MessageId);

  const play = async () => {
    onStart?.();
    const engine = getAudioEngine();
    try {
      await engine.start();
      const ctx = engine.context;
      if (!ctx) throw new Error('no context');
      const a = await import('@clearly/audio');
      const blob = await (await fetch(await demoClipUrl(feature === 'hum'))).blob();
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const src = new AudioBufferSourceNode(ctx, { buffer: buf });
      const base = playerSettings(profile, useAppSettings.getState().settings, {});
      const off = await settingsFor(feature, base, false);
      const on = await settingsFor(feature, base, true);
      const graph: ProcessingGraph = await a.buildProcessingGraph(ctx, profile, off, {
        input: src,
        mode: 'enhanced',
      });
      const t0 = ctx.currentTime + 0.05;
      src.start(t0, OFFSET_S, SEGMENT_S * 2);
      setPhase('off');
      const timers = [
        window.setTimeout(() => {
          graph.update(on);
          setPhase('on');
        }, SEGMENT_S * 1000),
        window.setTimeout(
          () => {
            cleanup();
            setPhase('done');
          },
          SEGMENT_S * 2000 + 300,
        ),
      ];
      const cleanup = () => {
        for (const id of timers) window.clearTimeout(id);
        try {
          src.stop();
        } catch {
          // Already stopped.
        }
        graph.dispose();
        src.disconnect();
        stopRef.current = null;
      };
      stopRef.current = cleanup;
    } catch {
      setPhase('failed');
    }
  };

  const busy = phase === 'off' || phase === 'on';
  return (
    <div className="mt-2">
      <Button
        variant="quiet"
        onClick={() => {
          if (busy) {
            stopRef.current?.();
            setPhase('idle');
          } else void play();
        }}
      >
        {busy ? t('example.stop') : t('example.play')}
      </Button>
      {phase === 'idle' ? <p className="text-sm text-text-muted">{t('example.note')}</p> : null}
      <StatusLine className="font-semibold" data-testid={`example-${feature}`}>
        {phase === 'off'
          ? t('example.off', { feature: name })
          : phase === 'on'
            ? t('example.on', { feature: name })
            : phase === 'done'
              ? t('example.done')
              : phase === 'failed'
                ? t('example.failed')
                : ''}
      </StatusLine>
    </div>
  );
}
