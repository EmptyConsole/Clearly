// "Back up and move to another device": optional, off by default. Local data is always the
// working copy; the server holds an encrypted backup. Changes sync after a 5-second debounce with
// optimistic versions; a 409 asks the person which version to keep. Failures never block the app.

import { BACKUP, migrate, type Backup } from '@clearly/core';
import { create } from 'zustand';
import { applyBackup, buildBackup } from '../storage/backup.ts';
import { onDataChanged } from '../storage/events.ts';
import { kv, type SyncState } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { testHooks } from '../test/hooks.ts';
import { api, ApiError, CONSENT_VERSION, conflictSchema } from './api.ts';

export const SYNC_DEBOUNCE_MS = 5000;

export type SyncStatus = 'off' | 'idle' | 'pending' | 'syncing' | 'offline' | 'conflict' | 'error';

export interface Conflict {
  readonly local: Backup;
  readonly remote: Backup;
  readonly remoteVersion: number;
  readonly remoteUpdatedAt: string;
}

export interface SyncStoreState {
  readonly loaded: boolean;
  readonly state: SyncState | null;
  readonly status: SyncStatus;
  readonly conflict: Conflict | null;
  load: () => Promise<void>;
  enable: (includeHistory: boolean) => Promise<void>;
  setIncludeHistory: (on: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
  schedule: () => void;
  resolve: (keep: 'local' | 'remote') => Promise<void>;
  restoreCode: () => Promise<{ code: string; expiresAt: string }>;
  signOutOthers: () => Promise<void>;
  deleteCloud: () => Promise<void>;
  /** Redeems a code and returns the backup for preview; nothing changes until confirmRestore. */
  redeem: (code: string) => Promise<PendingRestore>;
  confirmRestore: (p: PendingRestore) => Promise<void>;
}

export interface PendingRestore {
  readonly backup: Backup;
  readonly id: string;
  readonly token: string;
  readonly version: number;
}

let timer: number | undefined;
/** Set while applying a server copy, so the write it causes does not sync straight back. */
let applying = false;
let subscribed = false;

const debounceMs = (): number => testHooks()?.syncDebounceMs ?? SYNC_DEBOUNCE_MS;

async function payload(state: SyncState): Promise<Backup> {
  return buildBackup({ includeHistory: state.includeHistory });
}

async function saveState(s: SyncState | null): Promise<void> {
  if (s) await kv.set('sync', s);
  else await kv.delete('sync');
}

function offlineOr(e: unknown): SyncStatus {
  return e instanceof ApiError && e.kind === 'offline' ? 'offline' : 'error';
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  loaded: false,
  state: null,
  status: 'off',
  conflict: null,

  async load() {
    const state = (await kv.get('sync')) ?? null;
    set({ loaded: true, state, status: state ? 'idle' : 'off' });
    // Changes made while the server was unreachable are sent on the next start.
    if (state?.dirty) get().schedule();
    if (!subscribed) {
      subscribed = true;
      onDataChanged(() => {
        if (!applying) get().schedule();
      });
    }
  },

  async enable(includeHistory) {
    const doc = await buildBackup({ includeHistory });
    set({ status: 'syncing' });
    try {
      const r = await api.create(doc);
      const state: SyncState = {
        id: r.id,
        token: r.token,
        version: r.version,
        includeHistory,
        lastSyncedAt: new Date().toISOString(),
        consentVersion: CONSENT_VERSION,
        dirty: false,
      };
      await saveState(state);
      set({ state, status: 'idle' });
    } catch (e) {
      set({ status: get().state ? offlineOr(e) : 'off' });
      throw e;
    }
  },

  async setIncludeHistory(on) {
    const s = get().state;
    if (!s) return;
    const next = { ...s, includeHistory: on };
    await saveState(next);
    set({ state: next });
    get().schedule();
  },

  schedule() {
    const s = get().state;
    if (!s) return;
    if (!s.dirty) {
      const next = { ...s, dirty: true };
      set({ state: next });
      void saveState(next);
    }
    window.clearTimeout(timer);
    set({ status: get().status === 'conflict' ? 'conflict' : 'pending' });
    timer = window.setTimeout(() => {
      void get().syncNow();
    }, debounceMs());
  },

  async syncNow() {
    const s = get().state;
    if (!s || get().status === 'conflict') return;
    window.clearTimeout(timer);
    set({ status: 'syncing' });
    const doc = await payload(s);
    try {
      const r = await api.put(s.id, s.token, doc, s.version);
      const next = {
        ...s,
        version: r.version,
        lastSyncedAt: new Date().toISOString(),
        dirty: false,
      };
      await saveState(next);
      set({ state: next, status: 'idle' });
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'conflict') {
        const body = conflictSchema.safeParse(e.body);
        if (body.success) {
          try {
            const remote = migrate(BACKUP, body.data.payload);
            set({
              status: 'conflict',
              conflict: {
                local: doc,
                remote,
                remoteVersion: body.data.version,
                remoteUpdatedAt: body.data.updatedAt,
              },
            });
            return;
          } catch {
            // An unreadable server copy: keep this device's version below.
          }
        }
      }
      set({ status: offlineOr(e) });
    }
  },

  async resolve(keep) {
    const s = get().state;
    const c = get().conflict;
    if (!s || !c) return;
    const base = { ...s, version: c.remoteVersion, dirty: keep === 'local' };
    await saveState(base);
    set({ state: base, conflict: null, status: 'idle' });
    if (keep === 'remote') {
      applying = true;
      try {
        await applyBackup(c.remote);
        await useProfileStore.getState().load();
      } finally {
        applying = false;
      }
      return;
    }
    await get().syncNow();
  },

  async restoreCode() {
    const s = get().state;
    if (!s) throw new ApiError('not-found');
    return api.restoreCode(s.id, s.token);
  },

  async signOutOthers() {
    const s = get().state;
    if (!s) return;
    const r = await api.rotate(s.id, s.token);
    const next = { ...s, token: r.token };
    await saveState(next);
    set({ state: next });
  },

  async deleteCloud() {
    const s = get().state;
    if (!s) return;
    try {
      await api.remove(s.id, s.token);
    } catch (e) {
      // Already gone on the server is fine; anything else is reported.
      if (!(e instanceof ApiError && (e.kind === 'not-found' || e.kind === 'unauthorised')))
        throw e;
    }
    window.clearTimeout(timer);
    await saveState(null);
    set({ state: null, status: 'off', conflict: null });
  },

  async redeem(code) {
    const r = await api.redeem(code);
    return { backup: migrate(BACKUP, r.payload), id: r.id, token: r.token, version: r.version };
  },

  async confirmRestore(p) {
    applying = true;
    try {
      await applyBackup(p.backup);
    } finally {
      applying = false;
    }
    const state: SyncState = {
      id: p.id,
      token: p.token,
      version: p.version,
      includeHistory: p.backup.exposureDays !== undefined,
      lastSyncedAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
      dirty: false,
    };
    await saveState(state);
    set({ state, status: 'idle', conflict: null });
    await useProfileStore.getState().load();
  },
}));
