import type { Profile } from '@clearly/core';
import { t, type MessageId } from '../copy/en.ts';

export function demoName(p: Profile): string {
  return t(`demo.mode.profile.${p.id.slice(5)}` as MessageId);
}
