// Draws the app icons (PNG) from the design tokens, with no image dependencies: a primary-colour
// square with an audiogram-like curve and two points in the on-primary colour. Run with
// `node scripts/make-icons.ts`; the output in public/icons is tracked.

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = import.meta.dirname;
function hex(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m?.[1]) throw new Error(`not a colour: ${h}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tokenColour(name: string): [number, number, number] {
  const css = readFileSync(resolve(here, '../src/design/generated/tokens.css'), 'utf8');
  const m = new RegExp(`--t-color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`token ${name} not found`);
  return hex(m[1]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = (crcTable[(c ^ x) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size: number, px: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance from p to segment ab. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function draw(size: number, maskable: boolean): Buffer {
  const bg = tokenColour('primary');
  const fg = tokenColour('text-on-primary');
  // Content inside the maskable safe zone (80 percent circle) when maskable.
  const pad = maskable ? 0.22 : 0.14;
  const radius = maskable ? 0 : 0.18 * size;
  // The curve: flat, then sloping down to the right (in unit coordinates, y down).
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const x = i / 40;
    const y = 0.25 + 0.5 / (1 + Math.exp(-(x - 0.55) * 9));
    pts.push([pad + x * (1 - 2 * pad), pad + y * (1 - 2 * pad)]);
  }
  const dots: [number, number][] = [pts[8] ?? [0, 0], pts[30] ?? [0, 0]];
  const stroke = 0.045;
  const px = new Uint8Array(size * size * 4);
  const ss = 4; // supersampling per axis
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let inBg = 0;
      let inFg = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss;
          const fy = y + (sy + 0.5) / ss;
          // Rounded square.
          const cx = Math.max(radius - fx, 0, fx - (size - radius));
          const cy = Math.max(radius - fy, 0, fy - (size - radius));
          if (radius === 0 || Math.hypot(cx, cy) <= radius) inBg++;
          else continue;
          const ux = fx / size;
          const uy = fy / size;
          let d = Infinity;
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1] ?? [0, 0];
            const b = pts[i] ?? [0, 0];
            d = Math.min(d, segDist(ux, uy, a[0], a[1], b[0], b[1]));
          }
          const onDot = dots.some(([dx, dy]) => Math.hypot(ux - dx, uy - dy) < 0.07);
          if (d < stroke / 2 || onDot) inFg++;
        }
      const n = ss * ss;
      const a = inBg / n;
      const f = inBg ? inFg / inBg : 0;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round((bg[c] ?? 0) * (1 - f) + (fg[c] ?? 0) * f);
      px[o + 3] = Math.round(a * 255);
    }
  return png(size, px);
}

const out = resolve(here, '../public/icons');
writeFileSync(resolve(out, 'icon-192.png'), draw(192, false));
writeFileSync(resolve(out, 'icon-512.png'), draw(512, false));
writeFileSync(resolve(out, 'maskable-512.png'), draw(512, true));
writeFileSync(resolve(out, 'apple-touch-icon.png'), draw(180, true));
console.log('icons written to public/icons');
