import type { SessionOverrides } from '@clearly/core';
import { create } from 'zustand';
import { kv } from '../storage/repos.ts';
import type { TabCapture } from './tabCapture.ts';
import type { HumMode } from './useHumFilter.ts';

export type PlayerSource =
  | { readonly kind: 'demo'; readonly hum?: boolean }
  | { readonly kind: 'file'; readonly file: File }
  | { readonly kind: 'tab'; readonly capture: TabCapture };

export interface PlayerState {
  readonly source: PlayerSource | null;
  readonly session: SessionOverrides;
  /** Changes with every new source, so the player remounts with a fresh media element. */
  readonly sourceId: number;
  setSource: (s: PlayerSource | null) => void;
  setSession: (s: SessionOverrides) => void;
  /** Hum Filter mode (remembered on this device). */
  readonly humMode: HumMode;
  readonly humLoaded: boolean;
  setHumMode: (m: HumMode) => void;
  loadHumMode: () => Promise<void>;
}

const urls = new WeakMap<File, string>();

/** One object URL per file, revoked when the player moves to another source. */
export function fileUrl(file: File): string {
  let u = urls.get(file);
  if (!u) {
    u = URL.createObjectURL(file);
    urls.set(file, u);
  }
  return u;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  source: null,
  session: {},
  sourceId: 0,
  setSource: (source) => {
    const old = get().source;
    if (old?.kind === 'file' && old !== source) {
      const u = urls.get(old.file);
      if (u) {
        URL.revokeObjectURL(u);
        urls.delete(old.file);
      }
    }
    set({ source, session: {}, sourceId: get().sourceId + 1 });
    if (source) void kv.set('lastSource', source.kind);
  },
  setSession: (session) => {
    set({ session });
  },
  humMode: 'off',
  humLoaded: false,
  setHumMode: (humMode) => {
    set({ humMode, humLoaded: true });
    void kv.set('humMode', humMode);
  },
  loadHumMode: async () => {
    if (get().humLoaded) return;
    const m = await kv.get('humMode');
    if (!get().humLoaded) set({ humLoaded: true, ...(m ? { humMode: m } : {}) });
  },
}));
