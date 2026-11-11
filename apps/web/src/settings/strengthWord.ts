import { t, type MessageId } from '../copy/en.ts';

export function strengthWord(v: number): string {
  const key = v <= 0 ? 'off' : v < 0.5 ? 'light' : v < 0.9 ? 'medium' : v <= 1.1 ? 'full' : 'extra';
  return t(`settings.sound.strength.${key}` as MessageId);
}
