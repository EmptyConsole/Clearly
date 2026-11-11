import { useState } from 'react';
import { t } from '../copy/en.ts';
import { removeCaptionFiles } from '../captions/assets.ts';
import { removeCached } from '../heavy/heavy.ts';
import { rnnoiseInfo } from '../heavy/rnnoise.ts';
import { Button } from '../ui/Button.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Section } from './Section.tsx';

export function DownloadsSection() {
  const [status, setStatus] = useState('');
  return (
    <Section title={t('settings.downloads')}>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void removeCaptionFiles().then(() => {
              setStatus(t('captions.removed'));
            });
          }}
        >
          {t('captions.remove')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void removeCached(rnnoiseInfo()).then(() => {
              setStatus(t('cleanup.removed'));
            });
          }}
        >
          {t('cleanup.remove')}
        </Button>
      </div>
      <StatusLine>{status}</StatusLine>
    </Section>
  );
}
