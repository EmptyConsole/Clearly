// Window position and size, restored on the next start when they still fit on a connected
// display; otherwise the window opens at its default size, centred.

import { z } from 'zod';

export const Bounds = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(320),
  height: z.number().int().min(320),
});
export type Bounds = z.infer<typeof Bounds>;

export const WindowState = z.object({ bounds: Bounds, maximized: z.boolean() });
export type WindowState = z.infer<typeof WindowState>;

/** True when at least 100 by 100 px of the window lands on one of the work areas. */
export function isVisibleOn(bounds: Bounds, workAreas: readonly Bounds[]): boolean {
  return workAreas.some((a) => {
    const w = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x);
    const h = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y);
    return w >= 100 && h >= 100;
  });
}

export function restoreState(saved: unknown, workAreas: readonly Bounds[]): WindowState | null {
  const r = WindowState.safeParse(saved);
  if (!r.success || !isVisibleOn(r.data.bounds, workAreas)) return null;
  return r.data;
}

/** Caption window bounds, remembered per display (by display id). */
export const CaptionPositions = z.record(z.string(), Bounds);
