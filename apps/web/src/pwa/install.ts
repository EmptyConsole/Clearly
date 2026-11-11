// Install prompts (M10), by feature detection only:
//   - Where `beforeinstallprompt` fires, the event is kept here (it can fire before any screen
//     mounts) and a custom install banner is offered once, after the first completed Hearing
//     Check.
//   - Where it never fires, the app is not running standalone (matchMedia display-mode standalone
//     is false and navigator.standalone is not true), and the browser has the Add to Home Screen
//     model that navigator.standalone signals (the property exists), a one-time card shows the
//     manual steps.
// The exact logic is recorded in docs/DECISIONS.txt.

import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  readonly event: BeforeInstallPromptEvent | null;
  readonly installed: boolean;
}

export const useInstall = create<InstallState>(() => ({ event: null, installed: false }));

/** Called once from main.tsx, before the app renders. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ event: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    useInstall.setState({ event: null, installed: true });
  });
}

export function isStandaloneNow(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** The browser uses Add to Home Screen from its share menu instead of an install event. */
export function hasManualAddToHomeScreen(): boolean {
  return 'standalone' in navigator;
}

export type InstallOffer = 'prompt' | 'manual' | null;

/** Pure: which install offer to show, if any. */
export function installOffer(i: {
  readonly hasPromptEvent: boolean;
  readonly standalone: boolean;
  readonly manualA2hs: boolean;
  readonly checksDone: number;
  readonly alreadyShown: boolean;
}): InstallOffer {
  if (i.standalone || i.alreadyShown || i.checksDone < 1) return null;
  if (i.hasPromptEvent) return 'prompt';
  if (i.manualA2hs) return 'manual';
  return null;
}
