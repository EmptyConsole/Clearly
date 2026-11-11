import { useEffect, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { Card } from '../ui/Card.tsx';
import { BackLink, PageBody, PageHeading } from '../ui/Page.tsx';
import { PhoneArt } from './PhoneArt.tsx';

/** The address phones should open: PUBLIC_URL at build time, or this page's own origin. */
function publicUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL;
  return configured && /^https?:\/\//.test(configured) ? configured : window.location.origin;
}

const isLocal = (url: string): boolean => {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');
  } catch {
    return false;
  }
};

const IPHONE_STEPS = ['1', '2', '3', '4', '5'].map((n) => `everywhere.iphone.${n}` as MessageId);
const ANDROID_STEPS = ['1', '2', '3', '4', '5'].map((n) => `everywhere.android.${n}` as MessageId);
const WORKS: { key: MessageId; yes: boolean }[] = [
  { key: 'everywhere.works.check', yes: true },
  { key: 'everywhere.works.files', yes: true },
  { key: 'everywhere.works.calm', yes: true },
  { key: 'everywhere.works.captions', yes: true },
  { key: 'everywhere.works.hum', yes: true },
  { key: 'everywhere.works.auto', yes: true },
  { key: 'everywhere.works.tab', yes: false },
];

/** Clearly on other devices (M14): the phone page with a QR code, and the desktop app. */
export function EverywherePage() {
  const url = publicUrl();
  const [qr, setQr] = useState<string | null>(null);
  const download = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL;

  useEffect(() => {
    let live = true;
    void import('qrcode')
      .then((q) => q.toDataURL(url, { margin: 2, width: 240 }))
      .then((d) => {
        if (live) setQr(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <PageBody wide>
      <BackLink to="/more" label={t('nav.more')} />
      <PageHeading className="mt-2">{t('everywhere.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('everywhere.lead')}</p>

      <section id="phone" className="mt-6" aria-labelledby="ew-phone">
        <h2 id="ew-phone" className="text-2xl">
          {t('everywhere.phone.title')}
        </h2>
        <p className="mt-1 max-w-measure">{t('everywhere.phone.body')}</p>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          {qr ? (
            <img
              src={qr}
              width={160}
              height={160}
              alt={t('everywhere.qr.alt', { url })}
              className="rounded-control border-hairline border-border bg-surface-raised"
            />
          ) : null}
          <div className="max-w-measure">
            <p className="font-semibold">{t('everywhere.qr.lead')}</p>
            <p className="mt-1 break-all text-lg">{url}</p>
            {isLocal(url) ? (
              <p className="mt-2 text-text-muted">{t('everywhere.qr.local')}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 tablet:grid-cols-2">
          {(
            [
              ['iphone', 'everywhere.iphone.title', IPHONE_STEPS],
              ['android', 'everywhere.android.title', ANDROID_STEPS],
            ] as const
          ).map(([kind, title, steps]) => (
            <Card key={kind} className="flex flex-col gap-4 tablet:flex-row">
              <PhoneArt kind={kind} />
              <div>
                <h3 className="text-xl">{t(title)}</h3>
                <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4">
                  {steps.map((s) => (
                    <li key={s}>{t(s)}</li>
                  ))}
                </ol>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-text-muted">{t('everywhere.menusVary')}</p>

        <h3 className="mt-6 text-xl">{t('everywhere.works.title')}</h3>
        <ul className="mt-2 flex max-w-measure flex-col gap-1">
          {WORKS.map((w) => (
            <li key={w.key}>
              <span className="font-semibold">
                {w.yes ? t('everywhere.works.yes') : t('everywhere.works.no')}
              </span>{' '}
              {t(w.key)}
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-measure font-semibold">{t('everywhere.workaround')}</p>

        <h3 className="mt-6 text-xl">{t('everywhere.builtin.title')}</h3>
        <p className="mt-1 max-w-measure">{t('everywhere.builtin.body')}</p>
        <ul className="mt-2 flex max-w-measure list-disc flex-col gap-1 pl-4">
          <li>{t('everywhere.builtin.iphone')}</li>
          <li>{t('everywhere.builtin.android')}</li>
        </ul>
        <p className="mt-1 text-text-muted">{t('everywhere.menusVary')}</p>
      </section>

      <Card className="mt-8 max-w-measure">
        <h2 className="text-xl">{t('everywhere.desktop.title')}</h2>
        <p className="mt-1">{t('everywhere.desktop.body')}</p>
        <p className="mt-2 font-semibold">
          {download ? (
            <a href={download} target="_blank" rel="noopener">
              {t('everywhere.desktop.download')}
            </a>
          ) : (
            t('everywhere.desktop.notYet')
          )}
        </p>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4">
          <li>{t('everywhere.desktop.mac')}</li>
          <li>{t('everywhere.desktop.windows')}</li>
          <li>{t('everywhere.desktop.linux')}</li>
        </ol>
      </Card>
    </PageBody>
  );
}
