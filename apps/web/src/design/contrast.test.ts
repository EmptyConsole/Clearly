import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE, parseHex, relativeLuminance, simulate } from './contrast.ts';
import { checkTokens } from './check.ts';
import { readContrastRules, readTokens } from './model.ts';
import tokensJson from './tokens.json';

describe('WCAG contrast maths', () => {
  it('matches known reference pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // #767676 on white is the well-known lightest grey that passes 4.5:1 (4.54:1).
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    // #777777 just fails (4.48:1).
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    // Pure red on white is 4.0:1, pure blue on white 8.59:1.
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.0, 1);
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0f5e5a', '#fafaf7')).toBeCloseTo(
      contrastRatio('#fafaf7', '#0f5e5a'),
      10,
    );
  });

  it('computes relative luminance with the 0.04045 threshold', () => {
    expect(relativeLuminance(parseHex('#ffffff'))).toBeCloseTo(1, 10);
    expect(relativeLuminance(parseHex('#808080'))).toBeCloseTo(0.2159, 4);
  });

  it('rejects malformed colours', () => {
    expect(() => parseHex('#fff')).toThrow();
  });
});

describe('colour-vision simulation', () => {
  it('leaves greys unchanged', () => {
    for (const d of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      expect(deltaE(simulate('#808080', d), '#808080')).toBeLessThan(1.5);
    }
  });

  it('collapses classic red/green confusion under deuteranopia', () => {
    const normal = deltaE('#d62728', '#2ca02c');
    const simulated = deltaE(
      simulate('#d62728', 'deuteranopia'),
      simulate('#2ca02c', 'deuteranopia'),
    );
    expect(simulated).toBeLessThan(normal / 2);
  });
});

describe('token checker', () => {
  const tokens = readTokens(tokensJson);
  const rules = readContrastRules(tokensJson);

  it('passes the shipped tokens', () => {
    const { results, errors } = checkTokens(tokens, rules);
    expect(errors).toEqual([]);
    expect(results.filter((r) => !r.pass)).toEqual([]);
  });

  it('fails a pair that misses 4.5:1', () => {
    const broken = structuredClone(tokensJson);
    broken.color.light['text-muted'].$value = {
      colorSpace: 'srgb',
      components: [0.6, 0.6, 0.6],
      hex: '#999999',
    };
    const { results } = checkTokens(readTokens(broken), rules);
    const failing = results.filter((r) => !r.pass).map((r) => `${r.theme}: ${r.label}`);
    expect(failing).toContain('light: text-muted on surface (text)');
  });

  it('reports a role missing from one theme', () => {
    const broken = structuredClone(tokensJson) as { color: { dark: Record<string, unknown> } };
    delete broken.color.dark['focus'];
    const { errors } = checkTokens(readTokens(broken), rules);
    expect(errors.join('\n')).toMatch(/dark: missing colour role focus/);
  });

  it('rejects a colour whose hex does not match its components', () => {
    const broken = structuredClone(tokensJson);
    broken.color.light.text.$value.hex = '#ff0000';
    expect(() => readTokens(broken)).toThrow(/hex does not match/);
  });
});
