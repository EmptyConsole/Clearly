// The five destinations and More's children (M10), shared by the navigation and the More page.

import type { MessageId } from '../copy/en.ts';
import type { IconName } from '../ui/icons.tsx';

export interface Destination {
  readonly to: string;
  readonly label: MessageId;
  readonly icon: IconName;
  readonly end?: boolean;
}

export const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'nav.home', icon: 'home', end: true },
  { to: '/check', label: 'nav.check', icon: 'check' },
  { to: '/audio', label: 'nav.audio', icon: 'audio' },
  { to: '/quiet', label: 'nav.quiet', icon: 'quiet' },
  { to: '/more', label: 'nav.more', icon: 'more' },
];

export const MORE_CHILDREN: readonly Destination[] = [
  { to: '/more/health', label: 'nav.health', icon: 'health' },
  { to: '/more/settings', label: 'nav.profileSettings', icon: 'settings' },
  { to: '/more/everywhere', label: 'nav.everywhere', icon: 'devices' },
  { to: '/more/privacy', label: 'nav.privacy', icon: 'privacy' },
  { to: '/more/feedback', label: 'nav.feedback', icon: 'feedback' },
];
