import { describe, expect, it } from 'vitest';
import { cueAt, nextLiveCue } from './display.ts';

const a = { start: 1, end: 3, text: 'first' };
const b = { start: 4, end: 6, text: 'second' };

describe('caption display rules', () => {
  it('finds the cue at the media time', () => {
    expect(cueAt([a, b], 2)?.text).toBe('first');
    expect(cueAt([a, b], 3.5)).toBeNull();
  });
  it('keeps a live caption at least 6 s before the next replaces it', () => {
    let s = nextLiveCue(null, a, 0);
    s = nextLiveCue(s, b, 2);
    expect(s?.cue.text).toBe('first');
    s = nextLiveCue(s, b, 6);
    expect(s?.cue.text).toBe('second');
    expect(s?.since).toBe(6);
  });
  it('updates a growing caption without restarting its time', () => {
    const s = nextLiveCue({ cue: a, since: 10 }, { ...a, text: 'first words' }, 11);
    expect(s).toEqual({ cue: { ...a, text: 'first words' }, since: 10 });
  });
});
