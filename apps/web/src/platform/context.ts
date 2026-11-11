import { createContext, useContext } from 'react';
import type { PlatformAdapter } from './types.ts';

export const PlatformContext = createContext<PlatformAdapter | null>(null);

export function usePlatform(): PlatformAdapter {
  const p = useContext(PlatformContext);
  if (!p) throw new Error('usePlatform needs a PlatformProvider');
  return p;
}
