import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { ClearlyDb, setDbForTests } from '../storage/db.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useFlowStore } from '../check/flowStore.ts';

let n = 0;
beforeEach(() => {
  n += 1;
  setDbForTests(new ClearlyDb(`clearly-test-${n}`));
  useProfileStore.setState({
    loaded: false,
    active: null,
    profiles: [],
    demoMode: false,
    headphoneName: '',
    error: null,
  });
  useFlowStore.getState().reset();
  if (typeof window !== 'undefined') delete window.__clearlyTest;
});

afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia, scrollTo or vibrate.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}
