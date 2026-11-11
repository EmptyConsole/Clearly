// In-memory state for one pass through the Hearing Check screens.

import type { AgeRange, CheckOutput, PaceSetting, SessionResult } from '@clearly/core';
import { create } from 'zustand';

export interface RefinePlan {
  readonly seed: SessionResult;
  readonly lcDbfs: number;
  readonly ageRange: AgeRange | null;
  readonly headphoneName: string;
  /** Stored answers when continuing a paused Refine. */
  readonly responses: readonly boolean[];
  readonly rngSeed: number;
  /** A Refine continues the way the Express check was played (headphones or speakers). */
  readonly output: CheckOutput;
}

export interface FlowState {
  readonly ageRange: AgeRange | null;
  /** The person answered the age question or chose Skip. */
  readonly ageAnswered: boolean;
  readonly consent: boolean;
  readonly pace: PaceSetting;
  /** Headphones (each ear on its own) or computer speakers (both ears together). */
  readonly output: CheckOutput;
  readonly lcDbfs: number | null;
  readonly refine: RefinePlan | null;
  set: (patch: Partial<Omit<FlowState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const initial = {
  ageRange: null,
  ageAnswered: false,
  consent: false,
  pace: 'auto' as PaceSetting,
  output: 'headphones' as CheckOutput,
  lcDbfs: null,
  refine: null,
};

export const useFlowStore = create<FlowState>((set) => ({
  ...initial,
  set(patch) {
    set(patch);
  },
  reset() {
    set(initial);
  },
}));
