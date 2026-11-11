// Inline illustrations for the tab coach, in the one illustration style: 2 px token strokes,
// rounded corners, no fills except the primary accent.

export function CoachStep({ step }: { step: number }) {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" aria-hidden="true" className="shrink-0">
      <rect
        x="2"
        y="6"
        width="92"
        height="56"
        rx="6"
        fill="none"
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
      />
      <path d="M2 18 H94" stroke="var(--t-color-border-control)" strokeWidth="2" />
      <rect
        x="8"
        y="9"
        width="20"
        height="6"
        rx="2"
        fill={step === 1 ? 'var(--t-color-primary)' : 'none'}
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
      />
      <rect
        x="32"
        y="9"
        width="20"
        height="6"
        rx="2"
        fill={step === 3 ? 'var(--t-color-primary)' : 'none'}
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
      />
      {step === 1 ? (
        <path d="M40 30 L58 40 L40 50 Z" fill="var(--t-color-primary)" />
      ) : step === 2 ? (
        <>
          <rect
            x="20"
            y="24"
            width="56"
            height="30"
            rx="4"
            fill="var(--t-color-surface-raised)"
            stroke="var(--t-color-primary)"
            strokeWidth="2"
          />
          <rect x="26" y="42" width="8" height="8" rx="2" fill="var(--t-color-primary)" />
          <path d="M38 46 H68" stroke="var(--t-color-text-muted)" strokeWidth="2" />
        </>
      ) : (
        <path
          d="M30 40 Q38 28 46 40 T62 40"
          fill="none"
          stroke="var(--t-color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** The file card's illustration: a document with a sound wave, same stroke style. */
export function FileArt() {
  return (
    <svg width="120" height="72" viewBox="0 0 120 72" aria-hidden="true">
      <path
        d="M8 4 H40 L52 16 V68 H8 Z"
        fill="none"
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M40 4 V16 H52"
        fill="none"
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M62 36 h6 l4 -14 l6 28 l6 -22 l6 16 l6 -8 h18"
        fill="none"
        stroke="var(--t-color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
