import { AGE_RANGES, effectivePace, type CheckOutput } from '@clearly/core';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../copy/en.ts';
import { Button } from '../ui/Button.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { HeadphonesField } from '../ui/HeadphonesField.tsx';
import { ProfileSelector } from '../ui/ProfileSelector.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';
import { cx, focusRing } from '../ui/cx.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { useFlowStore } from './flowStore.ts';
import { ageLabel } from './ageLabel.ts';

function Item({ n, children }: { n: number; children: string }) {
  return (
    <li className="flex items-start gap-2 text-xl">
      <span
        aria-hidden="true"
        className="inline-flex size-[var(--t-space-6)] shrink-0 items-center justify-center rounded-pill border-control border-primary font-bold text-primary"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 pt-0.5 [overflow-wrap:anywhere]">{children}</span>
    </li>
  );
}

export function PreCheck() {
  useProfilesLoaded();
  const navigate = useNavigate();
  const flow = useFlowStore();
  const [tried, setTried] = useState(false);
  const errorId = useId();
  const legendId = useId();
  const slower = effectivePace(flow.pace, flow.ageRange) === 'slower' && flow.pace === 'auto';
  const speakers = flow.output === 'speakers';

  return (
    <PageBody>
      <PageHeading>{t('pre.title')}</PageHeading>
      <div className="mt-6">
        <p className="mb-1 text-xl font-semibold">{t('pre.output.legend')}</p>
        <Segmented<CheckOutput>
          legend={t('pre.output.legend')}
          large
          value={flow.output}
          onChange={(v) => {
            flow.set({ output: v });
          }}
          options={[
            { value: 'headphones', label: t('pre.output.headphones') },
            { value: 'speakers', label: t('pre.output.speakers') },
          ]}
        />
        {speakers ? <p className="mt-2 max-w-measure">{t('pre.output.speakersNote')}</p> : null}
      </div>
      <ol className="mt-6 flex flex-col gap-3">
        <Item n={1}>{speakers ? t('pre.item.speakers') : t('pre.item.headphones')}</Item>
        <Item n={2}>{t('pre.item.quiet')}</Item>
        <Item n={3}>{t('pre.item.volume')}</Item>
      </ol>
      <p className="mt-6 text-lg">{speakers ? t('pre.accuracySpeakers') : t('pre.accuracy')}</p>

      <div className="mt-6 flex flex-col gap-4">
        <ProfileSelector />
        {speakers ? null : <HeadphonesField />}
      </div>

      <fieldset className="mt-6" aria-describedby={legendId}>
        <legend className="text-xl font-semibold">{t('pre.age.legend')}</legend>
        <p id={legendId} className="text-text-muted">
          {t('pre.age.hint')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1 tablet:grid-cols-3">
          {AGE_RANGES.map((a) => (
            <label
              key={a}
              className={cx(
                'inline-flex min-h-[var(--t-target-min)] cursor-pointer items-center justify-center rounded-control border-control border-border-control bg-surface-raised px-2 text-center font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-text-on-primary',
                'has-[:focus-visible]:outline-[length:var(--t-focus-width)] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-[var(--t-focus-offset)]',
              )}
            >
              <input
                type="radio"
                name="age"
                className="sr-only"
                checked={flow.ageRange === a}
                onChange={() => {
                  flow.set({ ageRange: a, ageAnswered: true });
                }}
              />
              {ageLabel(a)}
            </label>
          ))}
          <label
            className={cx(
              'inline-flex min-h-[var(--t-target-min)] cursor-pointer items-center justify-center rounded-control border-control border-border-control px-2 font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-text-on-primary',
              'has-[:focus-visible]:outline-[length:var(--t-focus-width)] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-[var(--t-focus-offset)]',
            )}
          >
            <input
              type="radio"
              name="age"
              className="sr-only"
              checked={flow.ageAnswered && flow.ageRange === null}
              onChange={() => {
                flow.set({ ageRange: null, ageAnswered: true });
              }}
            />
            {t('pre.age.skip')}
          </label>
        </div>
        {slower ? <p className="mt-2 font-semibold">{t('pre.slowerAuto')}</p> : null}
      </fieldset>

      <div className="mt-6 rounded-surface border-hairline border-border bg-surface-sunken p-3">
        <Checkbox
          checked={flow.consent}
          required
          describedBy={tried && !flow.consent ? errorId : undefined}
          onCheckedChange={(v) => {
            flow.set({ consent: v });
          }}
        >
          {t('pre.consent')}
        </Checkbox>
        {tried && !flow.consent ? (
          <p id={errorId} className="mt-2 font-semibold text-danger">
            {t('pre.consentNeeded')}
          </p>
        ) : null}
      </div>

      <Button
        className={cx('mt-6 text-lg', focusRing)}
        aria-disabled={!flow.consent}
        onClick={() => {
          setTried(true);
          if (!flow.consent) return;
          if (!flow.ageAnswered) flow.set({ ageAnswered: true });
          flow.set({ refine: null });
          navigate('/check/calibrate');
        }}
      >
        {t('pre.continue')}
      </Button>
    </PageBody>
  );
}
