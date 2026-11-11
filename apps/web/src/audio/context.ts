import { createContext, useContext } from 'react';
import type { CheckAudio } from './AudioEngine.ts';

export const EngineContext = createContext<CheckAudio | null>(null);

export function useCheckAudio(): CheckAudio {
  const a = useContext(EngineContext);
  if (!a) throw new Error('useCheckAudio needs an EngineProvider');
  return a;
}
