import type { Audiogram } from '@clearly/core';
import { t, type MessageId } from '../copy/en.ts';

export function methodLabel(method: Audiogram['method']): string {
  return t(`results.method.${method}` as MessageId);
}
