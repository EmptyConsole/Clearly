// Clear Audio settings: everything goes through core's precedence function. Manual changes are
// remembered per profile (settingsOverrides); session overrides last only while playing.

import {
  resolveSettings,
  type ManualOverrides,
  type PresetId,
  type Profile,
  type SessionOverrides,
  type Settings,
} from '@clearly/core';
import type { GraphSettings, HumSettings } from '@clearly/audio';

/** With a profile, Voice focus starts at 30 percent until the person changes it (M05 defaults). */
export const DEFAULT_VOICE_FOCUS = 0.3;

export function manualFor(profile: Profile | null): ManualOverrides {
  if (!profile) return {};
  return { voiceFocus: DEFAULT_VOICE_FOCUS, ...profile.settingsOverrides };
}

export function playerSettings(
  profile: Profile | null,
  app: Pick<Settings, 'preset' | 'loudestLimitDbfs' | 'ambientBoostDb'>,
  session: SessionOverrides,
  preset: PresetId = app.preset,
  /** Auto Boost's live contribution (M09), when it is on. */
  auto: { readonly ambientBoostDb: number; readonly thresholdDropDb: number } | null = null,
  hum?: HumSettings,
): GraphSettings {
  const resolved = resolveSettings({
    preset,
    manual: manualFor(profile),
    session,
    loudestLimitDbfs: app.loudestLimitDbfs,
    ambientBoostDb: auto ? auto.ambientBoostDb : app.ambientBoostDb,
    thresholdDropDb: auto?.thresholdDropDb ?? 0,
  });
  return hum ? { ...resolved, hum } : resolved;
}
