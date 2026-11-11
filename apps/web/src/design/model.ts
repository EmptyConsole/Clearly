// Reads tokens.json (W3C Design Tokens Format Module 2025.10) into a flat, typed list.
// Supports group $type inheritance and curly-brace aliases. Validates every value with zod.
import { z } from 'zod';

const Dimension = z.object({ value: z.number(), unit: z.enum(['px', 'rem']) });
const Duration = z.object({ value: z.number().min(0), unit: z.enum(['ms', 's']) });
const Color = z
  .object({
    colorSpace: z.literal('srgb'),
    components: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]),
    alpha: z.number().min(0).max(1).optional(),
    hex: z.string().regex(/^#[0-9a-f]{6}$/),
  })
  .refine(
    (c) =>
      c.components.every(
        (v, i) => Math.abs(v * 255 - parseInt(c.hex.slice(1 + i * 2, 3 + i * 2), 16)) < 0.6,
      ),
    { message: 'hex does not match components' },
  );
const CubicBezier = z.tuple([
  z.number().min(0).max(1),
  z.number(),
  z.number().min(0).max(1),
  z.number(),
]);
const Shadow = z.object({
  color: Color,
  offsetX: Dimension,
  offsetY: Dimension,
  blur: Dimension,
  spread: Dimension,
  inset: z.boolean().optional(),
});

export const VALUE_SCHEMAS = {
  color: Color,
  dimension: Dimension,
  duration: Duration,
  cubicBezier: CubicBezier,
  fontFamily: z.union([z.string(), z.array(z.string()).min(1)]),
  fontWeight: z.number().min(1).max(1000),
  number: z.number(),
  shadow: Shadow,
} as const;

export type TokenType = keyof typeof VALUE_SCHEMAS;
export type ColorValue = z.infer<typeof Color>;
export type DimensionValue = z.infer<typeof Dimension>;
export type DurationValue = z.infer<typeof Duration>;
export type ShadowValue = z.infer<typeof Shadow>;

export type Token =
  | { path: string[]; type: 'color'; value: ColorValue; description?: string }
  | { path: string[]; type: 'dimension'; value: DimensionValue; description?: string }
  | { path: string[]; type: 'duration'; value: DurationValue; description?: string }
  | {
      path: string[];
      type: 'cubicBezier';
      value: [number, number, number, number];
      description?: string;
    }
  | { path: string[]; type: 'fontFamily'; value: string | string[]; description?: string }
  | { path: string[]; type: 'fontWeight'; value: number; description?: string }
  | { path: string[]; type: 'number'; value: number; description?: string }
  | { path: string[]; type: 'shadow'; value: ShadowValue; description?: string };

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const FORBIDDEN_NAME = /[{}.]/;

/** Flattens the token tree. Throws with the token path on any invalid entry. */
export function readTokens(root: unknown): Token[] {
  if (!isObject(root as Json)) throw new Error('tokens.json must be a JSON object');
  const raw: { path: string[]; type: string; value: Json; description?: string }[] = [];

  const walk = (node: JsonObject, path: string[], inherited: string | undefined): void => {
    const groupType = typeof node['$type'] === 'string' ? node['$type'] : inherited;
    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith('$')) continue;
      if (FORBIDDEN_NAME.test(name)) throw new Error(`Invalid name "${name}" at ${path.join('.')}`);
      if (!isObject(child))
        throw new Error(`${[...path, name].join('.')} must be a token or group`);
      const childPath = [...path, name];
      if ('$value' in child) {
        const type = typeof child['$type'] === 'string' ? child['$type'] : groupType;
        if (type === undefined) throw new Error(`${childPath.join('.')} has no $type`);
        const value = child['$value'];
        const description =
          typeof child['$description'] === 'string' ? child['$description'] : undefined;
        raw.push({
          path: childPath,
          type,
          value,
          ...(description === undefined ? {} : { description }),
        });
      } else {
        walk(child, childPath, groupType);
      }
    }
  };
  walk(root as JsonObject, [], undefined);

  const byPath = new Map(raw.map((t) => [t.path.join('.'), t]));
  const resolve = (value: Json, seen: string[]): Json => {
    if (typeof value === 'string') {
      const alias = /^\{([^{}]+)\}$/.exec(value);
      if (alias?.[1] !== undefined) {
        const target = alias[1];
        if (seen.includes(target))
          throw new Error(`Circular alias: ${[...seen, target].join(' -> ')}`);
        const hit = byPath.get(target);
        if (!hit) throw new Error(`Alias {${target}} does not point at a token`);
        return resolve(hit.value, [...seen, target]);
      }
    }
    return value;
  };

  return raw.map((t) => {
    if (!(t.type in VALUE_SCHEMAS))
      throw new Error(`${t.path.join('.')}: unsupported $type ${t.type}`);
    const type = t.type as TokenType;
    const parsed = VALUE_SCHEMAS[type].safeParse(resolve(t.value, [t.path.join('.')]));
    if (!parsed.success) {
      throw new Error(
        `${t.path.join('.')}: invalid ${type} value: ${parsed.error.issues[0]?.message ?? ''}`,
      );
    }
    return {
      path: t.path,
      type,
      value: parsed.data,
      ...(t.description === undefined ? {} : { description: t.description }),
    } as Token;
  });
}

export const THEMES = ['light', 'dark', 'contrast'] as const;
export type Theme = (typeof THEMES)[number];

/** Colour hex for a role in a theme, e.g. themeColor(tokens, 'dark', 'surface'). */
export function themeColors(tokens: Token[], theme: Theme): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tokens) {
    if (
      t.type === 'color' &&
      t.path[0] === 'color' &&
      t.path[1] === theme &&
      t.path[2] !== undefined
    ) {
      out.set(t.path[2], t.value.hex);
    }
  }
  return out;
}

const ContrastPair = z.object({
  fg: z.string(),
  bg: z.string(),
  kind: z.enum(['text', 'large-text', 'ui', 'focus']),
});
const Distinguishable = z.object({
  a: z.string(),
  b: z.string(),
  minDeltaE: z.number().positive(),
});
export const ContrastRules = z.object({
  pairs: z.array(ContrastPair).min(1),
  distinguishable: z.array(Distinguishable),
});
export type ContrastRules = z.infer<typeof ContrastRules>;

export function readContrastRules(root: unknown): ContrastRules {
  const ext = (root as { $extensions?: Record<string, unknown> }).$extensions?.[
    'app.clearly.contrast'
  ];
  return ContrastRules.parse(ext);
}
