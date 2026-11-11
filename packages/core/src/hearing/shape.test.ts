import { describe, expect, it } from 'vitest';
import { describeShape } from './shape.ts';

const both = (l: number[]) => ({ left: l, right: l });

describe('describeShape', () => {
  it('calls near-zero loss typical', () => {
    expect(describeShape(both([0, 0, 2, 3, 5, 6, 8, 10]))).toBe('typical');
  });
  it('finds a high-pitch slope', () => {
    expect(describeShape(both([0, 0, 2, 8, 15, 25, 32, 40]))).toBe('high-pitch');
  });
  it('finds a 4 kHz notch before calling it a slope', () => {
    expect(describeShape(both([0, 0, 0, 5, 20, 35, 25, 10]))).toBe('high-pitch-notch');
  });
  it('finds a low-pitch slope', () => {
    expect(describeShape(both([35, 30, 25, 15, 10, 8, 5, 5]))).toBe('low-pitch');
  });
  it('finds a flat loss', () => {
    expect(describeShape(both([25, 25, 28, 30, 30, 32, 30, 30]))).toBe('flat');
  });
  it('falls back to mixed', () => {
    expect(describeShape(both([20, 5, 20, 5, 10, 5, 10, 10]))).toBe('mixed');
  });
  it('averages the ears band by band', () => {
    const l = [0, 0, 2, 10, 25, 40, 50, 60];
    const r = [0, 0, 0, 0, 0, 0, 0, 0];
    expect(describeShape({ left: l, right: r })).toBe('high-pitch');
  });
});
