// Development-only token reference at /design. Absent from production builds (see app/router.tsx).
// Every value shown is read from tokens.json; nothing here is hard-coded.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { checkTokens } from './check.ts';
import { varName } from './compile.ts';
import {
  readContrastRules,
  readTokens,
  THEMES,
  themeColors,
  type Theme,
  type Token,
} from './model.ts';
import tokensJson from './tokens.json';
import { ComponentGallery } from './ComponentGallery.tsx';

type ThemeChoice = 'system' | Theme;
const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Follow system',
  light: 'Light',
  dark: 'Dark',
  contrast: 'High contrast',
};

const v = (t: Token) => `var(${varName(t.path)})`;
const name = (t: Token) => t.path.join('.');
const describe = (t: Token): string => {
  switch (t.type) {
    case 'dimension':
      return `${t.value.value}${t.value.unit}`;
    case 'duration':
      return `${t.value.value}${t.value.unit}`;
    case 'cubicBezier':
      return `cubic-bezier(${t.value.join(', ')})`;
    case 'fontFamily':
      return Array.isArray(t.value) ? t.value.join(', ') : t.value;
    case 'color':
      return t.value.hex;
    case 'shadow':
      return `y ${t.value.offsetY.value}, blur ${t.value.blur.value}, alpha ${t.value.color.alpha ?? 1}`;
    default:
      return String(t.value);
  }
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-6 border-t border-border pt-6 pb-2">
      <h2 id={id} className="text-xl mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TokenTable({ rows, sample }: { rows: Token[]; sample?: (t: Token) => ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm leading-ui">
        <thead>
          <tr className="border-b border-border-control">
            <th scope="col" className="py-1 pr-3 font-semibold">
              Token
            </th>
            <th scope="col" className="py-1 pr-3 font-semibold">
              Value
            </th>
            <th scope="col" className="py-1 pr-3 font-semibold">
              CSS variable
            </th>
            {sample ? (
              <th scope="col" className="py-1 font-semibold">
                Sample
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={name(t)} className="border-b border-border align-middle">
              <th scope="row" className="py-2 pr-3 font-medium">
                {name(t)}
              </th>
              <td className="py-2 pr-3 font-mono">{describe(t)}</td>
              <td className="py-2 pr-3 font-mono text-text-muted">{varName(t.path)}</td>
              {sample ? <td className="py-2">{sample(t)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DesignPage() {
  const tokens = useMemo(() => readTokens(tokensJson), []);
  const rules = useMemo(() => readContrastRules(tokensJson), []);
  const check = useMemo(() => checkTokens(tokens, rules), [tokens, rules]);
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = choice;
    return () => {
      delete root.dataset['theme'];
    };
  }, [choice]);

  const group = (head: string, sub?: string) =>
    tokens.filter((t) => t.path[0] === head && (sub === undefined || t.path[1] === sub));
  const colorsByTheme = Object.fromEntries(THEMES.map((th) => [th, themeColors(tokens, th)]));
  const roles = [...themeColors(tokens, 'light').keys()];
  const failures = check.results.filter((r) => !r.pass);

  return (
    <main className="mx-auto max-w-content px-2 py-6 tablet:px-4">
      <p className="text-sm text-text-muted">Development only. Not part of production builds.</p>
      <h1 className="text-3xl desktop:text-4xl mt-1">Design tokens</h1>
      <p className="mt-2">
        Every value on this page is read from{' '}
        <code className="font-mono">src/design/tokens.json</code>. Components use these tokens only.
      </p>

      <fieldset className="mt-4">
        <legend className="font-semibold mb-1">Preview theme</legend>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(THEME_LABELS) as ThemeChoice[]).map((c) => (
            <label
              key={c}
              className="inline-flex min-h-[var(--t-target-min)] items-center gap-1 rounded-control border-control border-border-control bg-surface-raised px-2 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-text-on-primary has-[:focus-visible]:outline-[length:var(--t-focus-width)] has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-[var(--t-focus-offset)] has-[:focus-visible]:outline-solid"
            >
              <input
                type="radio"
                name="theme"
                value={c}
                checked={choice === c}
                onChange={() => {
                  setChoice(c);
                }}
                className="sr-only"
              />
              {THEME_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <Section title="Colour roles">
        <p className="mb-3">
          The live column follows the preview theme. The other columns show each theme&apos;s value.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm leading-ui">
            <thead>
              <tr className="border-b border-border-control">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Role
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Live
                </th>
                {THEMES.map((th) => (
                  <th key={th} scope="col" className="py-1 pr-3 font-semibold">
                    {THEME_LABELS[th]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 font-medium">
                    {role}
                    <span className="block font-mono text-text-muted">--t-color-{role}</span>
                  </th>
                  <td className="py-2 pr-3">
                    <span
                      className="block h-6 w-8 rounded-control border-hairline border-border-control"
                      style={{ background: `var(--t-color-${role})` }}
                    />
                  </td>
                  {THEMES.map((th) => {
                    const hex = colorsByTheme[th]?.get(role) ?? '';
                    return (
                      <td key={th} className="py-2 pr-3">
                        <span className="flex items-center gap-1">
                          <span
                            className="block h-6 w-6 rounded-control border-hairline border-border-control"
                            style={{ background: hex }}
                          />
                          <span className="font-mono">{hex}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Contrast checks">
        <p className="mb-3" role="status">
          {failures.length === 0
            ? `All ${check.results.length} checks pass in every theme.`
            : `${failures.length} of ${check.results.length} checks fail.`}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm leading-ui">
            <thead>
              <tr className="border-b border-border-control">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Theme
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Pair
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Ratio
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Needs
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {check.results.map((r) => (
                <tr key={`${r.theme}-${r.label}`} className="border-b border-border">
                  <td className="py-1 pr-3">{THEME_LABELS[r.theme as Theme]}</td>
                  <td className="py-1 pr-3">{r.label}</td>
                  <td className="py-1 pr-3 font-mono">{r.value.toFixed(2)}</td>
                  <td className="py-1 pr-3 font-mono">{r.required}</td>
                  <td className={`py-1 font-semibold ${r.pass ? 'text-success' : 'text-danger'}`}>
                    {r.pass ? 'Pass' : 'Fail'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Type">
        <TokenTable rows={group('font', 'family')} />
        <div className="mt-4 space-y-3">
          {group('font', 'size')
            .slice()
            .reverse()
            .map((t) => (
              <div key={name(t)}>
                <p className="text-sm text-text-muted font-mono">
                  {name(t)} · {describe(t)}
                </p>
                <p style={{ fontSize: v(t) }} className="leading-heading font-bold">
                  Hear every word of the conversation
                </p>
              </div>
            ))}
        </div>
        <div className="mt-6">
          <TokenTable
            rows={[
              ...group('font', 'weight'),
              ...group('font', 'line-height'),
              ...group('font', 'tracking'),
              ...group('measure'),
            ]}
          />
        </div>
        <p className="mt-4 rounded-surface bg-surface-sunken p-3">
          Body text at the measure limit. Clearly adjusts what you hear so voices stand out from
          music and background noise. Your audio never leaves your device. Line length stops at
          about seventy characters so each line is easy to follow back to the start of the next.
        </p>
      </Section>

      <Section title="Spacing">
        <TokenTable
          rows={group('space')}
          sample={(t) => <span className="block h-3 bg-primary" style={{ width: v(t) }} />}
        />
      </Section>

      <Section title="Corners and borders">
        <TokenTable
          rows={group('radius')}
          sample={(t) => (
            <span
              className="block h-8 w-12 border-control border-border-control bg-surface-raised"
              style={{ borderRadius: v(t) }}
            />
          )}
        />
        <div className="mt-4">
          <TokenTable
            rows={group('border')}
            sample={(t) => <span className="block w-12 bg-text" style={{ height: v(t) }} />}
          />
        </div>
      </Section>

      <Section title="Elevation">
        <TokenTable
          rows={group('elevation')}
          sample={(t) => (
            <span
              className="block h-8 w-12 rounded-surface border-hairline border-border bg-surface-raised"
              style={{ boxShadow: v(t) }}
            />
          )}
        />
      </Section>

      <Section title="Motion">
        <TokenTable rows={[...group('motion', 'duration'), ...group('motion', 'easing')]} />
        <button
          type="button"
          className="mt-4 min-h-[var(--t-target-min)] rounded-control bg-primary px-3 font-semibold text-text-on-primary hover:bg-primary-hover"
          aria-pressed={moved}
          onClick={() => {
            setMoved((m) => !m);
          }}
        >
          Play motion samples
        </button>
        <div className="mt-3 space-y-1">
          {group('motion', 'duration').map((t) => (
            <div key={name(t)} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-sm">{t.path[2]}</span>
              <span className="relative block h-3 flex-1 rounded-pill bg-surface-sunken">
                <span
                  className="absolute top-0 block h-3 w-6 rounded-pill bg-primary ease-standard"
                  style={{
                    transitionProperty: 'left',
                    transitionDuration: v(t),
                    left: moved ? 'calc(100% - var(--t-space-6))' : '0',
                  }}
                />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-text-muted">
          With reduced motion on, every sample moves instantly.
        </p>
      </Section>

      <Section title="Focus and targets">
        <TokenTable rows={[...group('focus'), ...group('target')]} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="#focus-sample" id="focus-sample">
            A text link (press Tab to see focus)
          </a>
          <button
            type="button"
            className="min-h-[var(--t-target-min)] min-w-[var(--t-target-min)] rounded-control border-control border-border-control bg-surface-raised px-3"
          >
            48 px minimum target
          </button>
          <span
            className="grid place-items-center rounded-pill border-control border-border-control text-sm"
            style={{ width: 'var(--t-target-test-button)', height: 'var(--t-target-test-button)' }}
          >
            Test button size
          </span>
        </div>
      </Section>

      <Section title="Layout, breakpoints and layers">
        <TokenTable rows={[...group('breakpoint'), ...group('layout'), ...group('z')]} />
      </Section>

      <Section title="Components">
        <ComponentGallery />
      </Section>
    </main>
  );
}
