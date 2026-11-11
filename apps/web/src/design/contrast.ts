// Colour maths for the token checker: WCAG 2.2 contrast and colour-vision-deficiency simulation.
// Pure functions, no DOM. Sources are recorded in docs/DESIGN_RESEARCH.txt.

export type Rgb = readonly [number, number, number]; // 0..1 gamma-encoded sRGB

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((c) =>
        Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** WCAG 2.2 sRGB linearisation (threshold 0.04045). */
export function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function fromLinear(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** WCAG 2.2 relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

type Matrix = readonly [Rgb, Rgb, Rgb];

/**
 * Machado, Oliveira and Fernandes (2009), severity 1.0 (dichromacy).
 * Applied to linear RGB; see docs/DECISIONS.txt for the note on encoding.
 */
export const CVD_MATRICES: Record<'protanopia' | 'deuteranopia' | 'tritanopia', Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export type Deficiency = keyof typeof CVD_MATRICES;

export function simulate(hex: string, deficiency: Deficiency): string {
  const lin = parseHex(hex).map(toLinear) as unknown as Rgb;
  const m = CVD_MATRICES[deficiency];
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]) as unknown as Rgb;
  return toHex(out.map((c) => fromLinear(Math.min(1, Math.max(0, c)))) as unknown as Rgb);
}

/** CIE76 distance in CIELAB (D65). Above about 20 reads as clearly different colours. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function toLab(hex: string): Rgb {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
