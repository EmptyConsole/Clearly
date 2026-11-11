import { PRESET_IDS, type PresetId } from '@clearly/core';
import { t, type MessageId } from '../copy/en.ts';

/** Presets shown as chips: Movie, Speech and news, Music and Night (M06). */
export const PRESET_CHIPS: readonly PresetId[] = PRESET_IDS;

export function levelWord(v: number): string {
  const k = v <= 0 ? 'off' : v < 0.34 ? 'low' : v < 0.67 ? 'medium' : 'high';
  return t(`player.level.${k}` as MessageId);
}
