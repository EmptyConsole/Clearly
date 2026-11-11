// Quiet Lab illustrations, in the one illustration style: 2 px token strokes, rounded joins, the
// primary colour as the only accent. Each shows what the tool does to sound.

export type QuietArtKind = 'hum' | 'auto' | 'calm';

const stroke = 'var(--t-color-border-control)';
const accent = 'var(--t-color-primary)';

export function QuietArt({ kind }: { kind: QuietArtKind }) {
  return (
    <svg
      width="128"
      height="72"
      viewBox="0 0 128 72"
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 66 H124" stroke={stroke} />
      {kind === 'hum' ? (
        <>
          {/* A spectrum with three narrow hum spikes, and the notches that remove them. */}
          <path d="M4 50 C20 44 30 40 44 42 S70 36 84 40 S110 44 124 46" stroke={stroke} />
          {[24, 48, 72].map((x) => (
            <path key={x} d={`M${x} 46 V12`} stroke={stroke} strokeDasharray="3 4" />
          ))}
          <path
            d="M4 52 C14 50 20 50 22 52 L24 62 L26 52 C34 48 44 48 46 50 L48 62 L50 50 C60 46 68 46 70 48 L72 62 L74 48 C90 44 110 46 124 48"
            stroke={accent}
          />
        </>
      ) : kind === 'auto' ? (
        <>
          {/* Room-level bars rising, and the speech band lifting with them. */}
          {[10, 20, 30, 40].map((x, i) => (
            <rect
              key={x}
              x={x}
              y={58 - i * 10}
              width="6"
              height={8 + i * 10}
              rx="2"
              stroke={stroke}
            />
          ))}
          <path
            d="M56 50 C72 50 80 50 88 50 S104 50 124 50"
            stroke={stroke}
            strokeDasharray="3 4"
          />
          <path d="M56 50 C72 50 78 30 90 30 S106 50 124 50" stroke={accent} />
        </>
      ) : (
        <>
          {/* Slow swells of soft sound. */}
          <path
            d="M4 40 C14 28 24 28 34 40 S54 52 64 40 S84 28 94 40 S114 52 124 40"
            stroke={accent}
          />
          <path d="M4 52 C18 46 30 46 44 52 S70 58 84 52 S110 46 124 52" stroke={stroke} />
        </>
      )}
    </svg>
  );
}
