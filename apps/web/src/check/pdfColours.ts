import tokens from '../design/tokens.json';
import type { PdfColours } from './pdf.ts';

type Rgb = readonly [number, number, number];
const light = tokens.color.light;
const rgb = (c: { $value: { components: number[] } }): Rgb => [
  c.$value.components[0] ?? 0,
  c.$value.components[1] ?? 0,
  c.$value.components[2] ?? 0,
];

/** The PDF is printed, so it always uses the light theme's token colours. */
export const PDF_COLOURS: PdfColours = {
  text: rgb(light.text),
  muted: rgb(light['text-muted']),
  grid: rgb(light.border),
  right: rgb(light['ear-right']),
  left: rgb(light['ear-left']),
};
