// Active profile state (Zustand), loaded from storage. M04 adds full profile management.

import {
  BAND_FREQUENCIES_HZ,
  CALIBRATION_VERSION,
  CAP_DEFAULT_DB,
  HEARING_CHECK_VERSION,
  PROFILE_VERSION,
  STARTER_CAP_DB,
  audiogramFromSession,
  starterAudiogram,
  type AgeRange,
  type CheckOutput,
  type Audiogram,
  type HearingCheckRecord,
  type Profile,
  type SessionResult,
} from '@clearly/core';
import { create } from 'zustand';
import { t } from '../copy/en.ts';
import { MAX_PROFILES } from '@clearly/core';
import { hearingChecks, kv, profiles } from '../storage/repos.ts';
import { DEMO_PROFILES, isDemoId } from './demoProfiles.ts';

export interface SoundDefaults {
  readonly boostStyle?: Profile['boostStyle'];
  readonly capDb?: number;
  readonly strength?: number;
}

export class ProfileLimitError extends Error {
  override readonly name = 'ProfileLimitError';
}

export interface ProfileState {
  readonly loaded: boolean;
  readonly active: Profile | null;
  /** Stored profiles (never the demo ones). */
  readonly profiles: readonly Profile[];
  readonly demoMode: boolean;
  readonly headphoneName: string;
  readonly error: string | null;
  load: () => Promise<void>;
  setHeadphoneName: (name: string) => Promise<void>;
  createStarter: (ageRange: AgeRange, now?: Date) => Promise<Profile>;
  /** Stores a calibration level on the active profile (if there is one) with today's date. */
  saveCalibration: (lcDbfs: number, now?: Date) => Promise<void>;
  /** Stores the Calm Sounds pitch match on the active profile (M09). */
  saveRingingPitch: (hz: number) => Promise<void>;
  /** Saves a finished Express or Refine check and decides whether it becomes active. */
  saveCheck: (input: SaveCheckInput) => Promise<SaveCheckOutcome>;
  select: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  setProfileHeadphones: (id: string, headphoneName: string) => Promise<void>;
  /** "I got new headphones": copies the settings, clears calibration. Returns the new profile. */
  duplicate: (id: string, newName: string) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
  updateSound: (id: string, patch: SoundDefaults) => Promise<void>;
  setDemoMode: (on: boolean) => Promise<void>;
  /** Remembers manual changes (Clear Audio) on the active profile. Demo profiles are not saved. */
  updateOverrides: (patch: Partial<Profile['settingsOverrides']>) => Promise<void>;
}

export interface SaveCheckInput {
  readonly result: SessionResult;
  readonly ageRange: AgeRange | null;
  readonly headphoneName: string;
  /** Computer speakers: both ears together (the result is already mirrored). */
  readonly output?: CheckOutput;
  readonly now?: Date;
}

export interface SaveCheckOutcome {
  readonly record: HearingCheckRecord;
  /** True when this check's audiogram is now the active profile's. */
  readonly madeActive: boolean;
  /** True when Low reliability kept an earlier profile active. */
  readonly keptPrevious: boolean;
}

const newId = (): string => crypto.randomUUID();

/** Saves a profile and refreshes the store's list (and the active profile if it is this one). */
async function putAndRefresh(p: Profile): Promise<void> {
  await profiles.put(p);
  const list = await profiles.list();
  const state = useProfileStore.getState();
  useProfileStore.setState({
    profiles: list,
    active: state.active?.id === p.id ? p : state.active,
  });
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, 100);
  return trimmed.length > 0 ? trimmed : t('headphones.default');
}

function profileFrom(
  base: Profile | null,
  audiogram: Audiogram,
  headphoneName: string,
  calibration: Profile['calibration'],
  starter: boolean,
): Profile {
  return {
    schemaVersion: PROFILE_VERSION,
    id: base?.id ?? newId(),
    name: base?.name ?? cleanName(headphoneName),
    headphoneName,
    audiogram,
    calibration,
    settingsOverrides: base?.settingsOverrides ?? {},
    // Starter profiles use the Gentle style and a 12 dB cap (M03 section 2).
    boostStyle: starter
      ? 'gentle'
      : base && base.audiogram.method !== 'starter'
        ? base.boostStyle
        : 'standard',
    capDb: starter
      ? STARTER_CAP_DB
      : base && base.audiogram.method !== 'starter'
        ? base.capDb
        : CAP_DEFAULT_DB,
    strength: base?.strength ?? 1,
    headphoneCompensation: base?.headphoneCompensation ?? {
      left: BAND_FREQUENCIES_HZ.map(() => 0),
      right: BAND_FREQUENCIES_HZ.map(() => 0),
    },
    ...(base?.ringingPitchHz !== undefined ? { ringingPitchHz: base.ringingPitchHz } : {}),
  };
}

function findProfile(state: ProfileState, id: string): Profile | null {
  if (isDemoId(id)) return state.demoMode ? (DEMO_PROFILES.find((p) => p.id === id) ?? null) : null;
  return state.profiles.find((p) => p.id === id) ?? null;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  loaded: false,
  active: null,
  profiles: [],
  demoMode: false,
  headphoneName: '',
  error: null,

  async load() {
    try {
      const [id, name, demoMode, list] = await Promise.all([
        kv.get('activeProfileId'),
        kv.get('headphoneName'),
        kv.get('demoMode'),
        profiles.list(),
      ]);
      const demo = demoMode === true;
      let active: Profile | null = null;
      if (id && isDemoId(id))
        active = demo ? (DEMO_PROFILES.find((p) => p.id === id) ?? null) : null;
      else if (id) active = list.find((p) => p.id === id) ?? null;
      active ??= list[0] ?? null;
      set({
        loaded: true,
        active,
        profiles: list,
        demoMode: demo,
        headphoneName: name ?? active?.headphoneName ?? '',
        error: null,
      });
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async select(id) {
    const p = findProfile(get(), id);
    if (!p) return;
    await kv.set('activeProfileId', p.id);
    set({ active: p, headphoneName: isDemoId(p.id) ? get().headphoneName : p.headphoneName });
  },

  async rename(id, name) {
    const p = get().profiles.find((x) => x.id === id);
    const clean = name.trim().slice(0, 60);
    if (!p || clean.length === 0) return;
    await putAndRefresh({ ...p, name: clean });
  },

  async setProfileHeadphones(id, headphoneName) {
    const p = get().profiles.find((x) => x.id === id);
    const clean = headphoneName.trim().slice(0, 100);
    if (!p || clean.length === 0) return;
    // Calibration belongs to the old headphones, so it is cleared with the new name.
    await putAndRefresh({ ...p, headphoneName: clean, calibration: null });
  },

  async duplicate(id, newName) {
    const p = get().profiles.find((x) => x.id === id);
    if (!p) throw new Error('no such profile');
    if (get().profiles.length >= MAX_PROFILES) throw new ProfileLimitError('profile limit');
    const copy: Profile = {
      ...p,
      id: newId(),
      name: newName.trim().slice(0, 60) || p.name,
      headphoneName: newName.trim().slice(0, 100) || p.headphoneName,
      calibration: null,
    };
    await putAndRefresh(copy);
    await kv.set('activeProfileId', copy.id);
    set({ active: copy });
    return copy;
  },

  async remove(id) {
    await profiles.delete(id);
    const list = await profiles.list();
    const active = get().active?.id === id ? (list[0] ?? null) : get().active;
    if (active) await kv.set('activeProfileId', active.id);
    else await kv.delete('activeProfileId');
    set({ profiles: list, active });
  },

  async saveRingingPitch(hz) {
    const active = get().active;
    const p = active ? get().profiles.find((x) => x.id === active.id) : undefined;
    if (!p) return;
    await putAndRefresh({ ...p, ringingPitchHz: Math.round(hz) });
  },

  async updateSound(id, patch) {
    const p = get().profiles.find((x) => x.id === id);
    if (!p) return;
    await putAndRefresh({
      ...p,
      ...(patch.boostStyle ? { boostStyle: patch.boostStyle } : {}),
      ...(patch.capDb !== undefined ? { capDb: patch.capDb } : {}),
      // Strength is a remembered manual change: core's precedence reads settingsOverrides.
      ...(patch.strength !== undefined
        ? {
            strength: patch.strength,
            settingsOverrides: { ...p.settingsOverrides, strength: patch.strength },
          }
        : {}),
    });
  },

  async updateOverrides(patch) {
    const active = get().active;
    if (!active) return;
    const next: Profile = {
      ...active,
      settingsOverrides: { ...active.settingsOverrides, ...patch },
      ...(patch.strength !== undefined ? { strength: patch.strength } : {}),
    };
    if (isDemoId(active.id)) {
      set({ active: next });
      return;
    }
    await putAndRefresh(next);
    set({ active: next });
  },

  async setDemoMode(on) {
    await kv.set('demoMode', on);
    const active = get().active;
    if (!on && active && isDemoId(active.id)) {
      const first = get().profiles[0] ?? null;
      if (first) await kv.set('activeProfileId', first.id);
      else await kv.delete('activeProfileId');
      set({ demoMode: false, active: first });
      return;
    }
    set({ demoMode: on });
  },

  async setHeadphoneName(name: string) {
    set({ headphoneName: name });
    const clean = name.trim();
    if (clean.length > 0) await kv.set('headphoneName', clean.slice(0, 100));
    const active = get().active;
    if (active && !isDemoId(active.id) && clean.length > 0 && active.headphoneName !== clean) {
      const updated = { ...active, headphoneName: clean.slice(0, 100) };
      await putAndRefresh(updated);
      set({ active: updated });
    }
  },

  async createStarter(ageRange: AgeRange, now: Date = new Date()) {
    const headphoneName = cleanName(get().headphoneName);
    const audiogram = starterAudiogram(ageRange, now.toISOString());
    const current = get().active;
    // A demo profile is never the base for a real one.
    const base = current && !isDemoId(current.id) ? current : null;
    if (!base && get().profiles.length >= MAX_PROFILES)
      throw new ProfileLimitError('profile limit');
    const profile = profileFrom(base, audiogram, headphoneName, null, true);
    const record: HearingCheckRecord = {
      schemaVersion: HEARING_CHECK_VERSION,
      id: newId(),
      profileId: profile.id,
      createdAt: now.toISOString(),
      headphoneName,
      ageRange,
      lcDbfs: null,
      audiogram,
      session: null,
    };
    await putAndRefresh(profile);
    await hearingChecks.put(record);
    await kv.set('activeProfileId', profile.id);
    set({ active: profile });
    return profile;
  },

  async saveCalibration(lcDbfs: number, now: Date = new Date()) {
    const active = get().active;
    if (!active || isDemoId(active.id)) return;
    const headphoneName = cleanName(get().headphoneName || active.headphoneName);
    const updated: Profile = {
      ...active,
      headphoneName,
      calibration: {
        schemaVersion: CALIBRATION_VERSION,
        lcDbfs,
        headphoneName,
        date: now.toISOString(),
      },
    };
    await putAndRefresh(updated);
    set({ active: updated });
  },

  async saveCheck({ result, ageRange, headphoneName, output, now = new Date() }) {
    const name = cleanName(headphoneName);
    const createdAt = now.toISOString();
    const audiogram = audiogramFromSession(result, createdAt);
    const current = get().active;
    const previous = current && !isDemoId(current.id) ? current : null;
    const low = audiogram.reliability === 'Low';
    // Low keeps the previous profile active when one exists. With no profile at all, the Low
    // result is used for now so the person is never left without sound (DECISIONS M03).
    const keptPrevious = low && previous !== null;
    const calibration = {
      schemaVersion: CALIBRATION_VERSION,
      lcDbfs: result.lcDbfs,
      headphoneName: name,
      date: createdAt,
    } as const;
    let profileId: string;
    if (keptPrevious) {
      profileId = previous.id;
    } else {
      const profile = profileFrom(previous, audiogram, name, calibration, false);
      profileId = profile.id;
      await putAndRefresh(profile);
      await kv.set('activeProfileId', profile.id);
      set({ active: profile });
    }
    const record: HearingCheckRecord = {
      schemaVersion: HEARING_CHECK_VERSION,
      id: newId(),
      profileId,
      createdAt,
      headphoneName: name,
      ageRange,
      lcDbfs: result.lcDbfs,
      audiogram,
      session: result,
      ...(output ? { output } : {}),
    };
    await hearingChecks.put(record);
    return { record, madeActive: !keptPrevious, keptPrevious };
  },
}));
