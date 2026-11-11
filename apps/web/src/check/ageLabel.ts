import type { AgeRange } from '@clearly/core';
import { t, type MessageId } from '../copy/en.ts';

export const ageLabel = (a: AgeRange): string => t(`starter.age.${a}` as MessageId);
