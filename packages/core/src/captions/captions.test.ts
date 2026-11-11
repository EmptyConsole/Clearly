import { describe, expect, it } from 'vitest';
import {
  CAPTION_RATE,
  CUE_MAX_LINE_CHARS,
  WindowCollector,
  dropBacklog,
  hasVoice,
  mergeWords,
  toSrt,
  toVtt,
  wordsToCues,
  wrapCue,
  type Word,
} from './captions.ts';

const words = (s: string, start: number, step = 0.4): Word[] =>
  s
    .split(' ')
    .map((t, i) => ({ text: t, start: start + i * step, end: start + i * step + step * 0.9 }));

describe('windows', () => {
  it('makes 8 s windows every 7 s, for any block size', () => {
    const c = new WindowCollector();
    const out = [];
    const total = 20 * CAPTION_RATE;
    for (let s = 0; s < total; s += 1234)
      out.push(...c.push(new Float32Array(Math.min(1234, total - s))));
    out.push(...c.flush());
    expect(out.map((w) => w.start)).toEqual([0, 7, 14]);
    expect(out[0]?.samples.length).toBe(8 * CAPTION_RATE);
    expect(out[2]?.samples.length).toBe(6 * CAPTION_RATE);
  });
});

describe('voice gate', () => {
  it('skips silence and quiet hiss, passes speech-level sound', () => {
    expect(hasVoice(new Float32Array(CAPTION_RATE))).toBe(false);
    const hiss = Float32Array.from({ length: CAPTION_RATE }, () => (Math.random() - 0.5) * 0.002);
    expect(hasVoice(hiss)).toBe(false);
    const tone = Float32Array.from({ length: CAPTION_RATE }, (_, i) => 0.1 * Math.sin(i / 3));
    expect(hasVoice(tone)).toBe(true);
  });
});

describe('merging overlapping windows', () => {
  // Recorded fixture shape: window 0 covers 0-8 s, window 1 covers 7-15 s; both heard the words
  // around 7 to 8 s, slightly differently.
  const w0 = [
    ...words('ask not what your country', 5.0),
    { text: 'can', start: 7.1, end: 7.3 },
    { text: 'do', start: 7.4, end: 7.6 },
  ];
  const w1 = [
    { text: 'can', start: 7.12, end: 7.32 },
    { text: 'do', start: 7.6, end: 7.8 },
    ...words('for you', 8.0),
  ];
  it('takes earlier words from the first window and later ones from the second', () => {
    const merged = mergeWords(w0, w1, 7);
    expect(merged.map((w) => w.text).join(' ')).toBe('ask not what your country can do for you');
  });
  it('drops a word repeated across the boundary', () => {
    const a = [{ text: 'country', start: 7.3, end: 7.49 }];
    const b = [
      { text: 'country.', start: 7.5, end: 7.8 },
      { text: 'And', start: 8, end: 8.2 },
    ];
    expect(mergeWords(a, b, 7).map((w) => w.text)).toEqual(['country', 'And']);
  });
});

describe('cues, SRT and WebVTT', () => {
  const ws = words(
    'And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.',
    0.5,
  );
  const cues = wordsToCues(ws);
  it('keeps cues within two lines of 42 characters and 7 seconds', () => {
    for (const c of cues) {
      const lines = wrapCue(c.text).split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(CUE_MAX_LINE_CHARS);
      expect(c.end - c.start).toBeLessThanOrEqual(7);
    }
    expect(cues.map((c) => c.text).join(' ')).toContain('ask not what your country');
  });
  it('writes SRT that a strict parser accepts', () => {
    const srt = toSrt(cues);
    const blocks = srt.trim().split(/\n\n/);
    blocks.forEach((b, i) => {
      const [n, time, ...text] = b.split('\n');
      expect(n).toBe(String(i + 1));
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/);
      expect(text.length).toBeGreaterThan(0);
    });
    expect(srt).toContain('00:00:00,500 --> ');
  });
  it('writes WebVTT with the header and dot milliseconds', () => {
    const vtt = toVtt([{ start: 3661.5, end: 3663, text: 'A --> B' }]);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('01:01:01.500 --> 01:01:03.000');
    expect(vtt).toContain('A -> B');
  });
});

describe('backlog', () => {
  it('keeps the queue while within 15 s and drops to the newest window beyond', () => {
    const q = [{ start: 0 }, { start: 7 }, { start: 14 }];
    expect(dropBacklog(q, 14)).toEqual({ queue: q, skipped: false });
    expect(dropBacklog(q, 16)).toEqual({ queue: [{ start: 14 }], skipped: true });
    expect(dropBacklog([], 100)).toEqual({ queue: [], skipped: false });
  });
});
