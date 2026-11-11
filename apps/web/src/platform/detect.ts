// The one place that decides which adapter runs. The desktop adapter (M12) is detected only by
// the presence of window.clearlyDesktop, which the Electron preload exposes.

import type { ClearlyDesktopBridge } from '@clearly/core/desktop';
import { DesktopPlatformAdapter } from './desktop.ts';
import type { PlatformAdapter } from './types.ts';
import { WebPlatformAdapter } from './web.ts';

declare global {
  interface Window {
    clearlyDesktop?: ClearlyDesktopBridge;
  }
}

export function createPlatformAdapter(): PlatformAdapter {
  const env = { navigator, window, document };
  const bridge = window.clearlyDesktop;
  return bridge ? new DesktopPlatformAdapter(bridge, env) : new WebPlatformAdapter(env);
}
