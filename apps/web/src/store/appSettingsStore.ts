// App-wide settings (core's Settings document in kv): preset, loudest-sound limit, ambient boost.

import { SETTINGS, type Settings } from '@clearly/core';
import { create } from 'zustand';
import { appSettings } from '../storage/repos.ts';

export interface AppSettingsState {
  readonly loaded: boolean;
  readonly settings: Settings;
  load: () => Promise<void>;
  update: (patch: Partial<Omit<Settings, 'schemaVersion'>>) => Promise<void>;
}

export const useAppSettings = create<AppSettingsState>((set, get) => ({
  loaded: false,
  settings: SETTINGS.schema.parse({ schemaVersion: SETTINGS.currentVersion }),
  async load() {
    set({ loaded: true, settings: await appSettings.get() });
  },
  async update(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await appSettings.put(next);
  },
}));
