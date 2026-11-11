import { Link } from 'react-router-dom';
import { t } from '../copy/en.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { Switch } from '../ui/Switch.tsx';
import { ProfilesSection } from './ProfilesSection.tsx';
import { Section } from './Section.tsx';
import { SoundSection } from './SoundSection.tsx';
import { StorageSection } from './StorageSection.tsx';
import { SyncSection } from './SyncSection.tsx';
import { DownloadsSection } from './DownloadsSection.tsx';
import { AppearanceSection } from './AppearanceSection.tsx';
import { DesktopSection } from './DesktopSection.tsx';
import { BackLink } from '../ui/Page.tsx';

export function SettingsPage() {
  const loaded = useProfilesLoaded();
  const demoMode = useProfileStore((s) => s.demoMode);
  const setDemoMode = useProfileStore((s) => s.setDemoMode);
  if (!loaded) return <Loading />;
  return (
    <PageBody>
      <BackLink to="/more" label={t('nav.more')} />
      <PageHeading className="mt-2">{t('settings.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('settings.lead')}</p>
      <div className="mt-6">
        <ProfilesSection />
        <SoundSection />
        <AppearanceSection />
        <StorageSection />
        <SyncSection />
        <DownloadsSection />
        <DesktopSection />
        <Section title={t('demo.mode.title')}>
          <Switch
            checked={demoMode}
            onCheckedChange={(v) => void setDemoMode(v)}
            label={t('demo.mode.label')}
            hint={t('demo.mode.hint')}
          />
        </Section>
        <Section title={t('about.title')}>
          <p>{t('app.audioPromise')}</p>
          <ul className="flex flex-col gap-1">
            <li>
              <Link to="/more/privacy">{t('about.privacyLink')}</Link>
            </li>
            <li>
              <Link to="/more/feedback">{t('about.feedbackLink')}</Link>
            </li>
          </ul>
        </Section>
      </div>
    </PageBody>
  );
}
