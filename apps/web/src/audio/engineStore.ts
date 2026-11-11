import { createStore } from 'zustand/vanilla';

export type EngineStatus = 'idle' | 'starting' | 'running' | 'suspended' | 'closed' | 'error';

export interface EngineState {
  readonly status: EngineStatus;
  readonly sampleRate: number | null;
  /** Which silent-switch handling applied: the audioSession API, the silent element, or none. */
  readonly sessionHandling: 'audioSession' | 'silentElement' | 'none' | null;
  /** True while Clearly itself paused the output (hold); false for suspensions by the system. */
  readonly held: boolean;
}

export const createEngineStore = () =>
  createStore<EngineState>(() => ({
    status: 'idle',
    sampleRate: null,
    sessionHandling: null,
    held: false,
  }));

export type EngineStore = ReturnType<typeof createEngineStore>;
