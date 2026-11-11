import { DEFAULT_SHORTCUT } from '@clearly/core/desktop-events';
import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { isDesktopAdapter } from '../platform/desktop.ts';
import { usePlatform } from '../platform/context.ts';
import { kv } from '../storage/repos.ts';
import { Button } from '../ui/Button.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { TextField } from '../ui/TextField.tsx';
import { Section } from './Section.tsx';

/** Desktop app settings (M12): the global shortcut, the backup folder, and the version. */
export function DesktopSection() {
  const platform = usePlatform();
  const bridge = isDesktopAdapter(platform) ? platform.bridge : null;
  const [accelerator, setAccelerator] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [version, setVersion] = useState<{ version: string; downloadUrl: string } | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void kv.get('desktopShortcut').then(async (stored) => {
      const acc = stored === undefined ? DEFAULT_SHORTCUT : stored;
      // Applying the stored value again tells us whether it is registered right now.
      const state = await bridge.setGlobalShortcut({ accelerator: acc });
      if (!live) return;
      setAccelerator(state.accelerator);
      setDraft(state.accelerator ?? DEFAULT_SHORTCUT);
      setRegistered(state.registered);
    });
    void bridge.getVersion().then((v) => {
      if (live) setVersion(v);
    });
    return () => {
      live = false;
    };
  }, [bridge]);

  if (!bridge) return null;

  const apply = (acc: string | null) => {
    void bridge.setGlobalShortcut({ accelerator: acc }).then((state) => {
      setAccelerator(state.accelerator);
      setRegistered(state.registered);
      void kv.set('desktopShortcut', state.accelerator);
    });
  };

  return (
    <Section title={t('desktop.title')} id="desktop">
      <div>
        <TextField
          label={t('desktop.shortcut.label')}
          hint={t('desktop.shortcut.hint')}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              apply(draft.trim() || DEFAULT_SHORTCUT);
            }}
          >
            {t('desktop.shortcut.save')}
          </Button>
          {accelerator ? (
            <Button
              variant="quiet"
              onClick={() => {
                apply(null);
              }}
            >
              {t('desktop.shortcut.off')}
            </Button>
          ) : null}
        </div>
        <StatusLine className="mt-2">
          {accelerator === null
            ? t('desktop.shortcut.isOff')
            : registered === false
              ? t('desktop.shortcut.failed', { keys: accelerator })
              : registered
                ? t('desktop.shortcut.on', { keys: accelerator })
                : ''}
        </StatusLine>
      </div>
      <div>
        <p>{t('desktop.backup.body')}</p>
        <Button variant="secondary" className="mt-2" onClick={() => void bridge.revealBackup()}>
          {t('desktop.backup.show')}
        </Button>
      </div>
      {version ? (
        <p>
          {t('desktop.version', { version: version.version })}{' '}
          <a href={version.downloadUrl} target="_blank" rel="noopener">
            {t('desktop.download')}
          </a>
        </p>
      ) : null}
    </Section>
  );
}
