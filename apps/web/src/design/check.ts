// Token contrast checker. Every listed foreground/background pair is checked in every theme,
// every role must exist in every theme, and the ear colours must stay distinguishable under
// protanopia, deuteranopia and tritanopia.
import { contrastRatio, deltaE, simulate } from './contrast.ts';
import { THEMES, themeColors, type ContrastRules, type Token } from './model.ts';

export const MINIMUM = { text: 4.5, 'large-text': 3, ui: 3, focus: 3 } as const;

export type CheckResult = {
  theme: string;
  label: string;
  value: number;
  required: number;
  pass: boolean;
};

export function checkTokens(
  tokens: Token[],
  rules: ContrastRules,
): { results: CheckResult[]; errors: string[] } {
  const results: CheckResult[] = [];
  const errors: string[] = [];
  const reference = themeColors(tokens, 'light');

  for (const theme of THEMES) {
    const colors = themeColors(tokens, theme);
    for (const role of reference.keys()) {
      if (!colors.has(role)) errors.push(`${theme}: missing colour role ${role}`);
    }
    for (const pair of rules.pairs) {
      const fg = colors.get(pair.fg);
      const bg = colors.get(pair.bg);
      if (fg === undefined || bg === undefined) {
        errors.push(`${theme}: pair ${pair.fg} on ${pair.bg} names an unknown role`);
        continue;
      }
      const value = contrastRatio(fg, bg);
      const required = MINIMUM[pair.kind];
      results.push({
        theme,
        label: `${pair.fg} on ${pair.bg} (${pair.kind})`,
        value,
        required,
        pass: value >= required,
      });
    }
    for (const rule of rules.distinguishable) {
      const a = colors.get(rule.a);
      const b = colors.get(rule.b);
      if (a === undefined || b === undefined) {
        errors.push(`${theme}: distinguishable rule names an unknown role`);
        continue;
      }
      for (const d of ['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const) {
        const value = d === 'normal' ? deltaE(a, b) : deltaE(simulate(a, d), simulate(b, d));
        results.push({
          theme,
          label: `${rule.a} vs ${rule.b}, ${d} (delta E)`,
          value,
          required: rule.minDeltaE,
          pass: value >= rule.minDeltaE,
        });
      }
    }
  }
  return { results, errors };
}
