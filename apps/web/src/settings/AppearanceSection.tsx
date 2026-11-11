import { useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { Segmented } from '../ui/Segmented.tsx';
import { THEMES, saveTheme, storedTheme, type Theme } from '../ui/theme.ts';
import { Section } from './Section.tsx';

export function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  return (
    <Section title={t('appearance.title')}>
      <p className="font-semibold">{t('appearance.legend')}</p>
      <Segmented<Theme>
        legend={t('appearance.legend')}
        value={theme}
        onChange={(v) => {
          setTheme(v);
          saveTheme(v);
        }}
        options={THEMES.map((v) => ({ value: v, label: t(`appearance.${v}` as MessageId) }))}
      />
      <p className="mt-1 text-sm text-text-muted">{t('appearance.hint')}</p>
    </Section>
  );
}
