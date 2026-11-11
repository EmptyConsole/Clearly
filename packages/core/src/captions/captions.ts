// Caption maths (M07), pure and Node-testable: transcription windows, an energy voice-activity
// gate, merging overlapping windows by word timestamps, grouping words into cues, SRT and WebVTT
// writers, and the live backlog rule.

export const CAPTION_RATE = 16000;
export const WINDOW_SECONDS = 8;
export const OVERLAP_SECONDS = 1;
export const HOP_SECONDS = WINDOW_SECONDS - OVERLAP_SECONDS;
/** Live captions drop their backlog when they fall this far behind. */
export const MAX_LAG_SECONDS = 15;
/** Live captions stay on screen at least this long. */
export const MIN_DISPLAY_SECONDS = 6;
/** Energy gate: 30 ms frames above -45 dBFS RMS count as possible speech. */
export const VAD_FRAME_SECONDS = 0.03;
export const VAD_THRESHOLD_DBFS = -45;
/** A window is transcribed when at least this share of its frames are above the threshold. */
export const VAD_MIN_ACTIVE_SHARE = 0.05;
/** Cue layout: at most 2 lines of 42 characters and 7 seconds (common broadcast guidance). */
export const CUE_MAX_LINE_CHARS = 42;
export const CUE_MAX_LINES = 2;
export const CUE_MAX_SECONDS = 7;

export interface Word {
  readonly text: string;
  /** Seconds from the start of the media. */
  readonly start: number;
  readonly end: number;
}

export interface Cue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface Window {
  readonly index: number;
  /** Start in seconds. */
  readonly start: number;
  readonly samples: Float32Array;
}

/**
 * Collects mono 16 kHz audio and hands out 8 s windows every 7 s (1 s overlap). Feed it any
 * block size; the final partial window comes out of flush().
 */
export class WindowCollector {
  private buf = new Float32Array(0);
  private bufStart = 0; // seconds of buf[0]
  private next = 0;
  private readonly winFrames = WINDOW_SECONDS * CAPTION_RATE;
  private readonly hopFrames = HOP_SECONDS * CAPTION_RATE;

  push(samples: Float32Array): Window[] {
    const merged = new Float32Array(this.buf.length + samples.length);
    merged.set(this.buf);
    merged.set(samples, this.buf.length);
    this.buf = merged;
    const out: Window[] = [];
    while (this.buf.length >= this.winFrames) {
      out.push({
        index: this.next++,
        start: this.bufStart,
        samples: this.buf.slice(0, this.winFrames),
      });
      this.buf = this.buf.slice(this.hopFrames);
      this.bufStart += HOP_SECONDS;
    }
    return out;
  }

  /** The remaining audio as a last, shorter window (if it holds more than the overlap). */
  flush(): Window[] {
    if (this.buf.length <= OVERLAP_SECONDS * CAPTION_RATE && this.next > 0) return [];
    if (this.buf.length === 0) return [];
    const w = { index: this.next++, start: this.bufStart, samples: this.buf };
    this.buf = new Float32Array(0);
    return [w];
  }
}

/** True when the window probably holds speech (enough frames above -45 dBFS RMS). */
export function hasVoice(samples: Float32Array, rate = CAPTION_RATE): boolean {
  const frame = Math.max(1, Math.round(VAD_FRAME_SECONDS * rate));
  const threshold = 10 ** (VAD_THRESHOLD_DBFS / 10); // power
  let active = 0;
  let frames = 0;
  for (let s = 0; s + frame <= samples.length; s += frame) {
    let p = 0;
    for (let i = s; i < s + frame; i++) p += (samples[i] ?? 0) ** 2;
    if (p / frame >= threshold) active++;
    frames++;
  }
  return frames > 0 && active / frames >= VAD_MIN_ACTIVE_SHARE;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/**
 * Merges the words of a new window into the words so far. The boundary is the middle of the
 * overlap: earlier words come from what we have, later ones from the new window, because each
 * window hears its middle best. A word repeated across the boundary is kept once.
 */
export function mergeWords(
  committed: readonly Word[],
  incoming: readonly Word[],
  windowStart: number,
): Word[] {
  const boundary = windowStart + OVERLAP_SECONDS / 2;
  const before = committed.filter((w) => w.start < boundary);
  const after = incoming.filter((w) => w.start >= boundary && w.text.trim().length > 0);
  const last = before.at(-1);
  const first = after[0];
  if (last && first && norm(last.text) === norm(first.text) && first.start - last.end < 0.5) {
    after.shift();
  }
  return [...before, ...after];
}

/** Groups words into cues of at most 2 lines x 42 characters and 7 seconds, breaking at pauses. */
export function wordsToCues(words: readonly Word[]): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];
  const text = (ws: readonly Word[]) =>
    ws
      .map((w) => w.text.trim())
      .join(' ')
      .replace(/\s+([,.!?;:])/g, '$1');
  const flush = () => {
    const first = cur[0];
    const last = cur.at(-1);
    if (first && last) cues.push({ start: first.start, end: last.end, text: text(cur) });
    cur = [];
  };
  for (const w of words) {
    const first = cur[0];
    const prev = cur.at(-1);
    const candidate = text([...cur, w]);
    const tooLong = candidate.length > CUE_MAX_LINE_CHARS * CUE_MAX_LINES;
    const tooSlow = first !== undefined && w.end - first.start > CUE_MAX_SECONDS;
    const pause = prev !== undefined && w.start - prev.end > 1;
    if (cur.length > 0 && (tooLong || tooSlow || pause)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text.trim()) && text(cur).length > CUE_MAX_LINE_CHARS / 2) flush();
  }
  flush();
  return cues;
}

/** Wraps cue text to at most two lines of 42 characters, breaking between words. */
export function wrapCue(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > CUE_MAX_LINE_CHARS && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length <= CUE_MAX_LINES) return lines.join('\n');
  // Balance into two lines when wrapping made more (very long words).
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')}\n${words.slice(mid).join(' ')}`;
}

function stamp(seconds: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, d = 2) => String(n).padStart(d, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

export function toSrt(cues: readonly Cue[]): string {
  return cues
    .map(
      (c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${wrapCue(c.text)}\n`,
    )
    .join('\n');
}

export function toVtt(cues: readonly Cue[]): string {
  const body = cues
    .map(
      (c) =>
        `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${wrapCue(c.text).replace(/-->/g, '->')}\n`,
    )
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

/**
 * Live backlog: windows waiting for the transcriber. When the newest audio is more than 15 s
 * ahead of the window being transcribed, keep only the newest window and report the skip.
 */
export function dropBacklog<T extends { readonly start: number }>(
  queue: readonly T[],
  nowSeconds: number,
): { readonly queue: T[]; readonly skipped: boolean } {
  const oldest = queue[0];
  if (!oldest || nowSeconds - oldest.start <= MAX_LAG_SECONDS)
    return { queue: [...queue], skipped: false };
  const newest = queue.at(-1);
  return { queue: newest ? [newest] : [], skipped: true };
}

/** "12:30" or "1:02:10" for progress text. */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
