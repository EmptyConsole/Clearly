// Safe-listening tracker (M08): one-second RMS of the final output (from the graph's level taps,
// or reported directly by the Hearing Check and Calm Sounds), compared with the calibration
// tone's RMS (Lc - 3 dB). Stores only per-day minutes per zone in exposureDays; never audio.

import {
  EXPOSURE_DAY_VERSION,
  VERY_LOUD_ALERT_MINUTES,
  addListening,
  alertDue,
  localDay,
  zoneFor,
  type ExposureDay,
} from '@clearly/core';
import type { ProcessingGraph } from '@clearly/audio';
import { t } from '../copy/en.ts';
import { exposureDays, kv } from '../storage/repos.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useFlowStore } from '../check/flowStore.ts';
import { testHooks } from '../test/hooks.ts';
import { useToasts } from '../ui/toastStore.ts';

const FLUSH_MS = 5000;

class ExposureTracker {
  private power = 0;
  private seconds = 0;
  private pending = new Map<string, { c: number; l: number; v: number }>();
  private timer: number | null = null;

  private lc(): number | null {
    return useProfileStore.getState().active?.calibration?.lcDbfs ?? useFlowStore.getState().lcDbfs;
  }

  /** Adds `seconds` of output at mean power `rmsDbfs`. Called by graphs and other players. */
  record(rmsDbfs: number, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Test builds may count faster (trackerTimeScale), so minutes add up in a short test.
    const scale = testHooks()?.trackerTimeScale ?? 1;
    this.power += (Number.isFinite(rmsDbfs) ? 10 ** (rmsDbfs / 10) : 0) * seconds;
    this.seconds += seconds;
    if (this.seconds >= 1) {
      const meanDb = this.power > 0 ? 10 * Math.log10(this.power / this.seconds) : -Infinity;
      const lc = this.lc();
      const counted = this.seconds * scale;
      this.power = 0;
      this.seconds = 0;
      // Silence (under -70 dBFS) is not listening.
      if (lc !== null && meanDb > -70) {
        for (const [day, add] of addListening(zoneFor(meanDb, lc), counted, new Date())) {
          const p = this.pending.get(day) ?? { c: 0, l: 0, v: 0 };
          this.pending.set(day, {
            c: p.c + add.comfortableMinutes,
            l: p.l + add.loudMinutes,
            v: p.v + add.veryLoudMinutes,
          });
        }
        this.timer ??= window.setTimeout(() => {
          void this.flush();
        }, FLUSH_MS);
      }
    }
  }

  async flush(): Promise<void> {
    this.timer = null;
    if ((await kv.get('trackerPaused')) === true) {
      this.pending.clear();
      return;
    }
    const entries = [...this.pending];
    this.pending.clear();
    for (const [day, add] of entries) {
      const prev = await exposureDays.get(day);
      const next: ExposureDay = {
        schemaVersion: EXPOSURE_DAY_VERSION,
        id: day,
        comfortableMinutes: Math.min(1440, (prev?.comfortableMinutes ?? 0) + add.c),
        loudMinutes: Math.min(1440, (prev?.loudMinutes ?? 0) + add.l),
        veryLoudMinutes: Math.min(1440, (prev?.veryLoudMinutes ?? 0) + add.v),
        alerted: prev?.alerted ?? false,
      };
      const limit = (await kv.get('veryLoudAlertMinutes')) ?? VERY_LOUD_ALERT_MINUTES;
      if (day === localDay(new Date()) && alertDue(next.veryLoudMinutes, limit, next.alerted)) {
        await exposureDays.put({ ...next, alerted: true });
        this.alert(limit);
      } else {
        await exposureDays.put(next);
      }
    }
  }

  private alert(limit: number): void {
    useToasts.getState().show({
      message: t('track.alertToast', { n: limit }),
      action: {
        label: t('track.alertAction'),
        run: () => {
          const app = useAppSettings.getState();
          const v = Math.max(-24, app.settings.loudestLimitDbfs - 6);
          void app.update({ loudestLimitDbfs: v }).then(() => {
            useToasts.getState().show({ message: t('track.alertDone', { n: v }) });
          });
        },
      },
    });
  }

  /** Follows a playing graph's level readings. Returns an unsubscribe function. */
  attach(graph: Pick<ProcessingGraph, 'taps'>): () => void {
    return this.attachFeed(graph.taps.tracker);
  }

  /** Any level feed with the tracker's shape (Calm Sounds uses this). */
  attachFeed(feed: ProcessingGraph['taps']['tracker']): () => void {
    return feed.subscribe((r) => {
      this.record(r.rmsDbfs, r.intervalS);
    });
  }
}

export const tracker = new ExposureTracker();
