// Design research tool (development only). Opens each reference with Playwright at
// 1440, 1024 and 390 px, saves screenshots under research/ (gitignored) and writes the
// computed style measurements to research/measurements.json.
// Usage: node scripts/research/measure.ts [slug ...]
import { chromium, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Reference = { slug: string; url: string; follow?: string };

export const REFERENCES: Reference[] = [
  { slug: 'gov-uk', url: 'https://www.gov.uk/' },
  { slug: 'nhs-uk', url: 'https://www.nhs.uk/' },
  { slug: 'uswds', url: 'https://designsystem.digital.gov/' },
  { slug: 'headspace', url: 'https://www.headspace.com/' },
  { slug: 'gentler-streak', url: 'https://gentler.app/' },
  { slug: 'apple-hearing', url: 'https://www.apple.com/airpods-pro/hearing-health/' },
  { slug: 'flighty', url: 'https://flighty.com/' },
  { slug: 'things', url: 'https://culturedcode.com/things/' },
  { slug: 'shazam', url: 'https://www.shazam.com/' },
  { slug: 'guardian', url: 'https://www.theguardian.com/news/series/the-long-read', follow: 'a[href^="/news/2"]:not([href*="#"])' },
  { slug: 'pudding', url: 'https://pudding.cool/' },
  { slug: 'stripe', url: 'https://stripe.com/' },
  { slug: 'linear', url: 'https://linear.app/' },
];

const WIDTHS = [1440, 1024, 390] as const;
const OUT = 'research';

// Runs inside the page. Kept self-contained because it is serialised by Playwright.
function extract() {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const tally = (values: string[], top = 12) => {
    const m = new Map<string, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  };
  const typeOf = (sel: string) => {
    const el = [...document.querySelectorAll(sel)].find(visible);
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      family: s.fontFamily,
      size: s.fontSize,
      weight: s.fontWeight,
      lineHeight: s.lineHeight,
      tracking: s.letterSpacing,
      color: s.color,
      sample: el.textContent.trim().slice(0, 60),
    };
  };
  const all = [...document.querySelectorAll('body *')].filter(visible).slice(0, 4000);
  const styles = all.map((el) => [el, getComputedStyle(el)] as const);
  const px = (v: string) => (v && v !== '0px' && v !== 'auto' && v !== 'normal' ? v : '');

  const spacing: string[] = [];
  for (const [, s] of styles) {
    for (const v of [s.paddingTop, s.paddingLeft, s.marginTop, s.marginBottom, s.rowGap, s.columnGap]) spacing.push(px(v));
  }
  const bgByArea = new Map<string, number>();
  for (const [el, s] of styles) {
    if (s.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    const r = el.getBoundingClientRect();
    bgByArea.set(s.backgroundColor, (bgByArea.get(s.backgroundColor) ?? 0) + r.width * r.height);
  }
  const paragraphs = [...document.querySelectorAll('p')].filter(visible).slice(0, 40);
  const canvas = document.createElement('canvas').getContext('2d');
  const measure = paragraphs.map((p) => {
    const s = getComputedStyle(p);
    let avg = parseFloat(s.fontSize) * 0.5;
    if (canvas) {
      canvas.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const sample = 'the quick brown fox jumps over the lazy dog and keeps listening';
      avg = canvas.measureText(sample).width / sample.length;
    }
    return Math.round(p.getBoundingClientRect().width / avg);
  });
  const controls = (sel: string) =>
    [...document.querySelectorAll(sel)].filter(visible).slice(0, 30).map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return `${Math.round(r.height)}px h, radius ${s.borderRadius}, border ${s.borderTopWidth} ${s.borderTopColor}, bg ${s.backgroundColor}, ${s.fontSize}/${s.fontWeight}`;
    });
  const rootVars: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of [...rules]) {
      if (rule instanceof CSSStyleRule && /^(:root|html|body)\b/.test(rule.selectorText)) {
        for (const prop of [...rule.style]) {
          if (prop.startsWith('--') && /space|spacing|radius|font|size|color|colour|duration|ease|shadow|line|width/i.test(prop)) {
            rootVars.push(`${prop}: ${rule.style.getPropertyValue(prop).trim()}`);
          }
        }
      }
    }
  }
  return {
    title: document.title,
    documentWidth: document.documentElement.clientWidth,
    type: {
      body: typeOf('body'),
      h1: typeOf('h1'),
      h2: typeOf('h2'),
      h3: typeOf('h3'),
      p: typeOf('main p, p'),
      link: typeOf('main a, a'),
      button: typeOf('button, a[class*="button" i], a[class*="btn" i]'),
      input: typeOf('input[type="text"], input[type="search"], input:not([type])'),
    },
    fontSizes: tally(styles.map(([, s]) => s.fontSize), 14),
    fontFamilies: tally(styles.map(([, s]) => s.fontFamily.split(',').at(0) ?? ''), 6),
    lineHeights: tally(styles.map(([, s]) => `${s.fontSize}/${s.lineHeight}`), 10),
    spacing: tally(spacing, 16),
    textColors: tally(styles.map(([, s]) => s.color), 10),
    backgrounds: [...bgByArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, a]) => [c, Math.round(a)]),
    radii: tally(styles.map(([, s]) => px(s.borderRadius)), 10),
    shadows: tally(styles.map(([, s]) => (s.boxShadow === 'none' ? '' : s.boxShadow)), 6),
    borders: tally(styles.map(([, s]) => (s.borderTopStyle === 'none' ? '' : `${s.borderTopWidth} ${s.borderTopColor}`)), 8),
    transitions: tally(styles.map(([, s]) => (s.transitionDuration === '0s' ? '' : `${s.transitionDuration} ${s.transitionTimingFunction}`)), 8),
    animations: tally(styles.map(([, s]) => (s.animationName === 'none' ? '' : `${s.animationDuration} ${s.animationTimingFunction}`)), 6),
    maxWidths: tally(styles.map(([, s]) => (s.maxWidth === 'none' ? '' : s.maxWidth)), 10),
    paragraphCharsPerLine: measure,
    buttons: controls('button, [role="button"], a[class*="button" i], a[class*="btn" i], input[type="submit"]'),
    inputs: controls('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea'),
    focus: (() => {
      const el = [...document.querySelectorAll('a, button')].find(visible) as HTMLElement | undefined;
      if (!el) return null;
      el.focus();
      const s = getComputedStyle(el);
      return `outline ${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} offset ${s.outlineOffset}; box-shadow ${s.boxShadow}`;
    })(),
    rootVars: rootVars.slice(0, 80),
  };
}

async function measurePage(page: Page, ref: Reference, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(ref.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  if (ref.follow !== undefined) {
    const href = await page.locator(ref.follow).first().getAttribute('href');
    if (href) {
      await page.goto(new URL(href, ref.url).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    }
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, ref.slug, `${width}.png`) });
  await page.screenshot({ path: join(OUT, ref.slug, `${width}-full.png`), fullPage: true }).catch(() => undefined);
  return { pageUrl: page.url(), ...(await page.evaluate(extract)) };
}

const wanted = process.argv.slice(2);
const refs = wanted.length > 0 ? REFERENCES.filter((r) => wanted.includes(r.slug)) : REFERENCES;
const resultsPath = join(OUT, 'measurements.json');
const results: Record<string, unknown> = await readFile(resultsPath, 'utf8')
  .then((text) => JSON.parse(text) as Record<string, unknown>)
  .catch(() => ({}));

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'en-GB', colorScheme: 'light', reducedMotion: 'no-preference' });
for (const ref of refs) {
  await mkdir(join(OUT, ref.slug), { recursive: true });
  const page = await context.newPage();
  const byWidth: Record<string, unknown> = { url: ref.url, opened: new Date().toISOString() };
  for (const width of WIDTHS) {
    try {
      byWidth[String(width)] = await measurePage(page, ref, width);
      console.log(`${ref.slug} @ ${width}: ok`);
    } catch (error) {
      byWidth[String(width)] = { error: error instanceof Error ? error.message : String(error) };
      console.log(`${ref.slug} @ ${width}: FAILED ${String(error).slice(0, 120)}`);
    }
  }
  results[ref.slug] = byWidth;
  await page.close();
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
}
await browser.close();
