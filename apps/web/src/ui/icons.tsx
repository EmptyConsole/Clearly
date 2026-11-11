// The one icon set: 24 px grid, 2 px strokes in currentColor, round caps and joins, matched to
// the body text weight. Decorative only (aria-hidden); the text next to them is the name.

import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'check'
  | 'audio'
  | 'quiet'
  | 'more'
  | 'health'
  | 'settings'
  | 'devices'
  | 'privacy'
  | 'feedback'
  | 'back';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z" />,
  // An audiogram: two curves sloping down to the right.
  check: (
    <>
      <path d="M3 5 V19 H21" />
      <path d="M6 8 C10 8 12 10 14 13 S18 17 20 17" />
      <circle cx="6" cy="8" r="1.5" />
      <circle cx="14" cy="13" r="1.5" />
    </>
  ),
  // A waveform.
  audio: <path d="M3 12 H5 L7 7 L9 17 L11 4 L13 20 L15 9 L17 14 L19 12 H21" />,
  // Soft waves.
  quiet: (
    <>
      <path d="M3 10 C6 7 9 7 12 10 S18 13 21 10" />
      <path d="M3 15 C6 12 9 12 12 15 S18 18 21 15" />
    </>
  ),
  more: (
    <>
      <path d="M4 7 H20" />
      <path d="M4 12 H20" />
      <path d="M4 17 H20" />
    </>
  ),
  health: <path d="M3 12 H7 L9 8 L12 16 L14 11 L15 12 H21" />,
  settings: (
    <>
      <path d="M4 7 H14" />
      <path d="M18 7 H20" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17 H6" />
      <path d="M10 17 H20" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  devices: (
    <>
      <rect x="3" y="5" width="13" height="10" rx="1.5" />
      <path d="M7 19 H12" />
      <rect x="17" y="9" width="4" height="10" rx="1" />
    </>
  ),
  privacy: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11 V8 C8 5.8 9.8 4 12 4 S16 5.8 16 8 V11" />
    </>
  ),
  feedback: <path d="M4 5 H20 V16 H11 L7 20 V16 H4 Z" />,
  back: <path d="M15 5 L8 12 L15 19" />,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
