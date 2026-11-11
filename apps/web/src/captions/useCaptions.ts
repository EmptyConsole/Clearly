// Ties a CaptionSession to the player: file pre-transcription (with "Captions first") or live
// capture from Tap A. Returns the cues and status for display.

import type { ProcessingGraph } from '@clearly/audio';
import type { Cue } from '@clearly/core';
import { useEffect, useRef, useState } from 'react';
import type { CaptionModel } from './assets.ts';
import { CaptionSession, type CaptionStatus } from './session.ts';

export const CAPTIONS_AHEAD_SECONDS = 10;

export interface CaptionSource {
  readonly kind: 'file' | 'live';
  /** File mode: the audio to read ahead. */
  readonly blob?: Blob;
  readonly media?: HTMLMediaElement | null;
}

export function useCaptions(o: {
  enabled: boolean;
  model: CaptionModel;
  source: CaptionSource | null;
  graph: ProcessingGraph | null;
  ctx: AudioContext | null;
  captionsFirst: boolean;
}) {
  const [cues, setCues] = useState<readonly Cue[]>([]);
  const [status, setStatus] = useState<CaptionStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const sessionRef = useRef<CaptionSession | null>(null);
  // Live when the source is live, or when a file cannot be read ahead (set asynchronously).
  const [fallbackLive, setFallbackLive] = useState(false);
  const { enabled, model, source, graph, ctx, captionsFirst } = o;
  const blob = source?.blob ?? null;
  const media = source?.media ?? null;
  const kind = source?.kind ?? null;
  const liveMode = enabled && (kind === 'live' || fallbackLive);

  // Start or stop the session.
  useEffect(() => {
    if (!enabled || !kind) return;
    const s = new CaptionSession(model, { onCues: setCues, onStatus: setStatus });
    sessionRef.current = s;
    if (kind === 'file' && blob) {
      const duration = media && Number.isFinite(media.duration) ? media.duration : 0;
      void s.startFile(blob, duration).then((ok) => {
        if (!ok) {
          s.startLive();
          setFallbackLive(true);
        }
      });
    } else {
      s.startLive();
    }
    return () => {
      s.stop();
      sessionRef.current = null;
      setFallbackLive(false);
      setCues([]);
      setStatus(null);
    };
  }, [enabled, model, kind, blob, media]);

  // Live: connect the capture worklet to Tap A.
  useEffect(() => {
    if (!liveMode || !graph || !ctx) return;
    let node: AudioWorkletNode | null = null;
    let cancelled = false;
    void import('@clearly/audio').then(({ createCaptureNode }) => {
      if (cancelled) return;
      node = createCaptureNode(ctx);
      node.port.onmessage = (e: MessageEvent<{ type: string; samples?: Float32Array }>) => {
        if (e.data.type === 'capture' && e.data.samples)
          sessionRef.current?.pushLive(e.data.samples);
      };
      graph.taps.captionsTapA.connect(node);
    });
    return () => {
      cancelled = true;
      if (node) {
        graph.taps.captionsTapA.disconnect(node);
        node.port.onmessage = null;
        node.port.close();
      }
    };
  }, [liveMode, graph, ctx]);

  // Captions first: hold playback until captions are 10 s ahead (file mode only).
  useEffect(() => {
    if (!enabled || !captionsFirst || !media || liveMode || !status) return;
    const check = () => {
      if (status.phase === 'complete' || status.phase === 'error') {
        if (waiting) {
          setWaiting(false);
          void media.play().catch(() => undefined);
        }
        return;
      }
      const ahead = status.readySeconds - media.currentTime;
      if (!media.paused && ahead < CAPTIONS_AHEAD_SECONDS) {
        media.pause();
        setWaiting(true);
      } else if (waiting && ahead >= CAPTIONS_AHEAD_SECONDS) {
        setWaiting(false);
        void media.play().catch(() => undefined);
      }
    };
    check();
    media.addEventListener('play', check);
    media.addEventListener('timeupdate', check);
    return () => {
      media.removeEventListener('play', check);
      media.removeEventListener('timeupdate', check);
    };
  }, [enabled, captionsFirst, media, liveMode, status, waiting]);

  return {
    cues,
    status,
    waiting,
    live: liveMode,
    liveTime: () => sessionRef.current?.liveTime ?? 0,
  };
}
