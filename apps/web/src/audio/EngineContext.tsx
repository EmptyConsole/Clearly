import type { ReactNode } from 'react';
import { getAudioEngine, type CheckAudio } from './AudioEngine.ts';
import { EngineContext } from './context.ts';

export function EngineProvider({ audio, children }: { audio?: CheckAudio; children: ReactNode }) {
  return (
    <EngineContext.Provider value={audio ?? getAudioEngine()}>{children}</EngineContext.Provider>
  );
}
