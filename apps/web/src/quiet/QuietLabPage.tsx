import { t, type MessageId } from '../copy/en.ts';
import { ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';
import { Popover } from '../ui/Popover.tsx';
import { HearExample } from '../player/HearExample.tsx';
import { QuietArt, type QuietArtKind } from './QuietArt.tsx';

interface Tool {
  readonly key: QuietArtKind;
  readonly to: string;
}

const TOOLS: readonly Tool[] = [
  { key: 'hum', to: '/audio' },
  { key: 'auto', to: '/quiet/auto-boost' },
  { key: 'calm', to: '/quiet/calm' },
];

/** Quiet Lab landing page: three tools, each with what it does, what it cannot do, and more. */
export function QuietLabPage() {
  const id = (key: string, part: string) => `quiet.${key}.${part}` as MessageId;
  return (
    <PageBody wide>
      <PageHeading>{t('quiet.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('quiet.lead')}</p>
      <ul className="mt-6 flex flex-col gap-4">
        {TOOLS.map((tool) => (
          <li key={tool.key}>
            <Card className="grid gap-3 tablet:grid-cols-[auto_1fr] tablet:items-start">
              <QuietArt kind={tool.key} />
              <div>
                <h2 className="text-2xl">{t(id(tool.key, 'title'))}</h2>
                <p className="mt-1">{t(id(tool.key, 'does'))}</p>
                <p className="mt-1 text-text-muted">{t(id(tool.key, 'cannot'))}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ButtonLink to={tool.to}>{t(id(tool.key, 'open'))}</ButtonLink>
                  <Popover label={t('quiet.whatDoes')}>
                    <p>{t(id(tool.key, 'more'))}</p>
                  </Popover>
                </div>
                {tool.key === 'hum' ? <HearExample feature="hum" /> : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </PageBody>
  );
}
