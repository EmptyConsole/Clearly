import { useEffect, useState } from 'react';

const BARS = 48;

/** A live level display drawn with tokens (decorative; the meters carry the information). */
export function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: BARS }, () => 0.04));
  useEffect(() => {
    if (!analyser) return;
    const data = new Float32Array(analyser.frequencyBinCount);
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 66) return;
      last = now;
      analyser.getFloatFrequencyData(data);
      const next: number[] = [];
      for (let b = 0; b < BARS; b++) {
        // Log-spaced bins from about 60 Hz to 12 kHz.
        const f = 60 * 200 ** (b / (BARS - 1));
        const i = Math.min(
          data.length - 1,
          Math.round((f / (analyser.context.sampleRate / 2)) * data.length),
        );
        const db = data[i] ?? -120;
        next.push(Math.max(0.04, Math.min(1, (db + 100) / 70)));
      }
      setLevels(next);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [analyser]);
  return (
    <svg viewBox={`0 0 ${BARS * 10} 120`} className="h-auto w-full" aria-hidden="true">
      {levels.map((l, i) => (
        <rect
          key={i}
          x={i * 10 + 2}
          y={60 - l * 56}
          width={6}
          height={Math.max(2, l * 112)}
          rx={3}
          fill="var(--t-color-primary)"
          opacity={0.35 + 0.65 * l}
        />
      ))}
    </svg>
  );
}
