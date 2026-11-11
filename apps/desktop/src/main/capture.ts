// System sound (M12). Electron 45's Streams.audio documents 'loopback' (and 'loopbackWithMute') as
// supported on Windows only; macOS and Linux were tested here and their results are recorded in
// docs/DECISIONS.txt (M12). 'loopbackWithMute' stays off everywhere until a test on Windows
// confirms that it keeps Clearly's own playback audible.

import type { LoopbackSupport } from '@clearly/core/desktop';

export function osName(platform: NodeJS.Platform): LoopbackSupport['os'] {
  return platform === 'win32'
    ? 'windows'
    : platform === 'darwin'
      ? 'macos'
      : platform === 'linux'
        ? 'linux'
        : 'other';
}

export function loopbackSupport(platform: NodeJS.Platform): LoopbackSupport {
  const os = osName(platform);
  return { os, system: os === 'windows', withMute: false };
}
