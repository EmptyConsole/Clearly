import {
  BOOST_STYLES,
  CAP_MAX_DB,
  CAP_MIN_DB,
  STRENGTH_MAX,
  STRENGTH_MIN,
  type BoostStyle,
} from '@clearly/core';
import { t, type MessageId } from '../copy/en.ts';
import { strengthWord } from './strengthWord.ts';
import { isDemoId } from '../store/demoProfiles.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { Segmented } from '../ui/Segmented.tsx';
import { Slider } from '../ui/Slider.tsx';
import { Section } from './Section.tsx';

export function SoundSection() {
  const active = useProfileStore((s) => s.active);
  const update = useProfileStore((s) => s.updateSound);
  if (!active || isDemoId(active.id)) {
    return (
      <Section title={t('settings.sound.title')} lead={t('settings.sound.lead')}>
        <p>{t('settings.sound.noProfile')}</p>
      </Section>
    );
  }
  const starter = active.audiogram.method === 'starter';
  return (
    <Section title={t('settings.sound.title')} lead={t('settings.sound.lead')}>
      <div>
        <p className="mb-1 font-semibold">{t('settings.sound.style')}</p>
        {starter ? (
          <p className="text-text-muted">{t('settings.sound.styleStarter')}</p>
        ) : (
          <Segmented<BoostStyle>
            legend={t('settings.sound.style')}
            value={active.boostStyle}
            onChange={(v) => void update(active.id, { boostStyle: v })}
            options={BOOST_STYLES.map((b) => ({
              value: b,
              label: t(`settings.sound.style.${b}` as MessageId),
            }))}
          />
        )}
      </div>
      {!starter ? (
        <Slider
          label={t('settings.sound.cap', { n: active.capDb })}
          value={active.capDb}
          min={CAP_MIN_DB}
          max={CAP_MAX_DB}
          step={1}
          valueText={t('settings.sound.cap', { n: active.capDb })}
          onChange={(v) => void update(active.id, { capDb: v })}
        />
      ) : null}
      <Slider
        label={t('settings.sound.strength', {
          word: strengthWord(active.strength),
          n: Math.round(active.strength * 100),
        })}
        value={active.strength}
        min={STRENGTH_MIN}
        max={STRENGTH_MAX}
        step={0.05}
        valueText={t('settings.sound.strength', {
          word: strengthWord(active.strength),
          n: Math.round(active.strength * 100),
        })}
        onChange={(v) => void update(active.id, { strength: v })}
      />
    </Section>
  );
}
