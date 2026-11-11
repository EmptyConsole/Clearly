// Inline illustrations for the phone page, in the one illustration style (as CoachArt): 2 px
// token strokes, rounded corners, no fills except the primary accent. The accent marks the
// button the steps name: Share on iPhone, the browser menu on Android.

export function PhoneArt({ kind }: { kind: 'iphone' | 'android' }) {
  return (
    <svg width="88" height="150" viewBox="0 0 88 150" aria-hidden="true" className="shrink-0">
      <rect
        x="4"
        y="4"
        width="80"
        height="142"
        rx="14"
        fill="none"
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
      />
      <rect
        x="12"
        y="22"
        width="50"
        height="10"
        rx="3"
        fill="none"
        stroke="var(--t-color-border-control)"
        strokeWidth="2"
      />
      <path
        d="M14 46 H70 M14 56 H62 M14 66 H66"
        stroke="var(--t-color-text-muted)"
        strokeWidth="2"
      />
      {kind === 'iphone' ? (
        <>
          <path d="M12 124 H76" stroke="var(--t-color-border-control)" strokeWidth="2" />
          {/* Share: a square with an arrow up, in the bottom bar. */}
          <rect x="37" y="130" width="14" height="10" rx="2" fill="var(--t-color-primary)" />
          <path
            d="M44 120 V134 M39 125 L44 120 L49 125"
            fill="none"
            stroke="var(--t-color-primary)"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          {/* The browser menu: three dots at the top right, highlighted. */}
          <circle cx="72" cy="11" r="2" fill="var(--t-color-primary)" />
          <circle cx="72" cy="17" r="2" fill="var(--t-color-primary)" />
          <circle cx="72" cy="23" r="2" fill="var(--t-color-primary)" />
          <rect
            x="40"
            y="80"
            width="38"
            height="34"
            rx="4"
            fill="var(--t-color-surface-raised)"
            stroke="var(--t-color-primary)"
            strokeWidth="2"
          />
          <path d="M46 90 H72 M46 100 H66" stroke="var(--t-color-text-muted)" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
