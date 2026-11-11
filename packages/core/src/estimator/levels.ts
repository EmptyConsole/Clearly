// Level arithmetic for the Hearing Check. Everything here is in absolute dBFS unless the name
// ends in RelLc (relative to the calibration level Lc). The two units are never mixed.

import {
  CALIBRATION_MAX_DBFS,
  CALIBRATION_MIN_DBFS,
  CEILING_ABOVE_LC_DB,
  CEILING_MAX_DBFS,
  GRID_ABOVE_CEILING_DB,
  GRID_BELOW_LC_DB,
  GRID_MIN_DBFS,
  GRID_STEP_DB,
  PRESENT_FLOOR_DBFS,
} from '../constants.ts';

export interface LevelFrame {
  readonly lcDbfs: number;
  readonly ceilingDbfs: number;
  readonly floorDbfs: number;
  readonly gridMinDbfs: number;
  readonly gridMaxDbfs: number;
}

export function assertValidLc(lcDbfs: number): void {
  if (!Number.isFinite(lcDbfs) || lcDbfs > CALIBRATION_MAX_DBFS || lcDbfs < CALIBRATION_MIN_DBFS) {
    throw new RangeError(
      `Lc must be between ${CALIBRATION_MIN_DBFS} and ${CALIBRATION_MAX_DBFS} dBFS, got ${lcDbfs}`,
    );
  }
}

export function levelFrame(lcDbfs: number): LevelFrame {
  assertValidLc(lcDbfs);
  const ceilingDbfs = Math.min(lcDbfs + CEILING_ABOVE_LC_DB, CEILING_MAX_DBFS);
  return {
    lcDbfs,
    ceilingDbfs,
    floorDbfs: PRESENT_FLOOR_DBFS,
    gridMinDbfs: Math.max(lcDbfs - GRID_BELOW_LC_DB, GRID_MIN_DBFS),
    gridMaxDbfs: ceilingDbfs + GRID_ABOVE_CEILING_DB,
  };
}

/** Grid of candidate thresholds in dBFS, 1 dB apart, inclusive at both ends. */
export function thresholdGridDbfs(frame: LevelFrame): Float64Array {
  const lo = Math.ceil(frame.gridMinDbfs);
  const hi = Math.floor(frame.gridMaxDbfs);
  const n = Math.round((hi - lo) / GRID_STEP_DB) + 1;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = lo + i * GRID_STEP_DB;
  return grid;
}

export function toRelLc(valueDbfs: number, lcDbfs: number): number {
  return valueDbfs - lcDbfs;
}

export function toDbfs(valueRelLc: number, lcDbfs: number): number {
  return valueRelLc + lcDbfs;
}
