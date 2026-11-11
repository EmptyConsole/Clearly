// A tiny change feed: repositories announce writes so the backup reminder and sync can react.

export type DataKind =
  'profiles' | 'hearingChecks' | 'sinChecks' | 'exposureDays' | 'captionCache' | 'settings';

type Listener = (kind: DataKind) => void;
const listeners = new Set<Listener>();

export function onDataChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function emitDataChanged(kind: DataKind): void {
  for (const cb of listeners) cb(kind);
}
