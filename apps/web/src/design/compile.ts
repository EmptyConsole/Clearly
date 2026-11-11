// Compiles tokens into two CSS files:
//  - tokens.css: runtime custom properties, with colour roles switched per theme
//  - theme.css: the Tailwind v4 theme (@theme inline), pointing at those custom properties
// Font sizes and the measure compile to rem so they follow the browser's text-size setting.
import { THEMES, type Theme, type Token } from './model.ts';

const ROOT_FONT_PX = 16;

const rem = (px: number) => `${+(px / ROOT_FONT_PX).toFixed(4)}rem`;

function dimension(t: Extract<Token, { type: 'dimension' }>, asRem: boolean): string {
  const { value, unit } = t.value;
  if (unit === 'rem') return `${value}rem`;
  if (value === 0) return '0';
  return asRem ? rem(value) : `${value}px`;
}

function rgba(hex: string, alpha: number | undefined): string {
  if (alpha === undefined || alpha === 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

const quoteFamily = (f: string) => (/^[a-z-]+$/i.test(f) && !f.includes(' ') ? f : `"${f}"`);

/** Runtime custom property for a token: --t- plus the full path. Colours drop the theme segment. */
export function varName(path: string[]): string {
  const parts = path[0] === 'color' ? ['color', ...path.slice(2)] : path;
  return '--t-' + parts.join('-');
}

function cssValue(t: Token): string {
  switch (t.type) {
    case 'color':
      return rgba(t.value.hex, t.value.alpha);
    case 'dimension': {
      const asRem = t.path[0] === 'font' || t.path[0] === 'measure';
      return dimension(t, asRem);
    }
    case 'duration':
      return `${t.value.value}${t.value.unit}`;
    case 'cubicBezier':
      return `cubic-bezier(${t.value.join(', ')})`;
    case 'fontFamily':
      return (Array.isArray(t.value) ? t.value : [t.value]).map(quoteFamily).join(', ');
    case 'fontWeight':
    case 'number':
      return String(t.value);
    case 'shadow': {
      const s = t.value;
      const px = (d: { value: number; unit: string }) =>
        d.value === 0 ? '0' : `${d.value}${d.unit}`;
      return `${s.inset === true ? 'inset ' : ''}${px(s.offsetX)} ${px(s.offsetY)} ${px(s.blur)} ${px(s.spread)} ${rgba(s.color.hex, s.color.alpha)}`;
    }
  }
}

function colorBlock(tokens: Token[], theme: Theme): string {
  return tokens
    .filter((t) => t.type === 'color' && t.path[0] === 'color' && t.path[1] === theme)
    .map((t) => `  ${varName(t.path)}: ${cssValue(t)};`)
    .join('\n');
}

export function compileTokensCss(tokens: Token[]): string {
  const base = tokens
    .filter((t) => t.path[0] !== 'color')
    .map((t) => `  ${varName(t.path)}: ${cssValue(t)};`)
    .join('\n');
  const [light, dark, contrast] = THEMES.map((th) => colorBlock(tokens, th));
  return `/* Generated from tokens.json by scripts/build-tokens.ts. Do not edit. */
:root {
${base}
}

/* Light is the default. data-theme="light" pins it regardless of the system setting. */
:root,
:root[data-theme='light'] {
  color-scheme: light;
${light}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
${dark}
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
${dark}
}

/* High contrast: chosen with the in-app switch, or by the system's increased-contrast setting. */
@media (prefers-contrast: more) {
  :root:not([data-theme]) {
    color-scheme: light;
${contrast}
  }
}

:root[data-theme='contrast'] {
  color-scheme: light;
${contrast}
}
`;
}

/** Tailwind v4 theme. The default theme is not imported, so only these utilities exist. */
export function compileTailwindTheme(tokens: Token[]): string {
  const lines: string[] = [];
  const add = (name: string, value: string) => lines.push(`  ${name}: ${value};`);
  for (const t of tokens) {
    const [group, sub, leaf] = t.path;
    const v = `var(${varName(t.path)})`;
    if (group === 'color' && sub === 'light' && leaf !== undefined) add(`--color-${leaf}`, v);
    else if (group === 'space' && sub !== undefined) add(`--spacing-${sub}`, v);
    else if (group === 'radius' && sub !== undefined) add(`--radius-${sub}`, v);
    else if (group === 'elevation' && sub !== undefined) add(`--shadow-${sub}`, v);
    else if (group === 'font' && sub === 'family' && leaf !== undefined) add(`--font-${leaf}`, v);
    else if (group === 'font' && sub === 'weight' && leaf !== undefined)
      add(`--font-weight-${leaf}`, v);
    else if (group === 'font' && sub === 'size' && leaf !== undefined) add(`--text-${leaf}`, v);
    else if (group === 'font' && sub === 'line-height' && leaf !== undefined)
      add(`--leading-${leaf}`, v);
    else if (group === 'font' && sub === 'tracking' && leaf !== undefined)
      add(`--tracking-${leaf}`, v);
    else if (group === 'motion' && sub === 'easing' && leaf !== undefined) add(`--ease-${leaf}`, v);
    else if (group === 'measure' && sub !== undefined) add(`--container-measure`, v);
    else if (group === 'layout' && sub === 'content') add(`--container-content`, v);
    else if (group === 'breakpoint' && sub !== undefined && t.type === 'dimension') {
      // Media queries cannot read custom properties, so breakpoints carry literal values.
      add(`--breakpoint-${sub}`, dimension(t, false));
    }
  }
  return `/* Generated from tokens.json by scripts/build-tokens.ts. Do not edit. */
@theme inline {
  --*: initial;
${lines.join('\n')}
}
`;
}
