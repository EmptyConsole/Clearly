import { useEffect } from 'react';
import { useProfileStore } from './profileStore.ts';

/** Loads profiles from storage once; returns whether loading finished. */
export function useProfilesLoaded(): boolean {
  const loaded = useProfileStore((s) => s.loaded);
  const load = useProfileStore((s) => s.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  return loaded;
}
