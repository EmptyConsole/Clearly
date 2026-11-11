// WebPlatformAdapter: everything is feature-detected, with graceful fallbacks.

import {
  UnsupportedFeatureError,
  type AudioSourceDescriptor,
  type Capabilities,
  type OpenFileOptions,
  type PersistResult,
  type PlatformAdapter,
  type SaveFileOptions,
  type SaveResult,
} from './types.ts';

/** The globals detection reads, so tests can pass a fake environment. */
export interface DetectEnv {
  readonly navigator: Navigator;
  readonly window: Window;
  readonly document: Document;
}

const has = (obj: object | undefined, key: string): boolean => obj !== undefined && key in obj;

function supportsConstraint(media: MediaDevices | undefined, name: string): boolean {
  if (!media || typeof media.getSupportedConstraints !== 'function') return false;
  return (media.getSupportedConstraints() as Record<string, boolean | undefined>)[name] === true;
}

export function detectCapabilities(env: DetectEnv): Capabilities {
  const nav = env.navigator;
  const win = env.window;
  const media = nav.mediaDevices as MediaDevices | undefined;
  const coarse = win.matchMedia('(pointer: coarse)').matches;
  // getDisplayMedia exists on some phones but cannot capture other apps' audio there; a coarse
  // primary pointer without a fine one is how we tell (feature detection, never browser names).
  const fine = win.matchMedia('(any-pointer: fine)').matches;
  const ctxProto = has(win, 'AudioContext')
    ? (win as unknown as { AudioContext: { prototype: object } }).AudioContext.prototype
    : undefined;
  return {
    // Tab audio: getDisplayMedia alone is not enough (Firefox and Safari have it but share no tab
    // audio). The suppressLocalAudioPlayback constraint is supported exactly where tab audio
    // capture is (feature detection, DECISIONS M14), so it gates the option.
    tabAudioCapture:
      has(media, 'getDisplayMedia') &&
      (!coarse || fine) &&
      supportsConstraint(media, 'suppressLocalAudioPlayback'),
    systemAudioCapture: false,
    virtualCableRouting: false,
    outputDeviceSelection: has(ctxProto, 'setSinkId'),
    nativeFileDialogs: false,
    floatingCaptions: has(win, 'documentPictureInPicture'),
    installPrompt: has(win, 'onbeforeinstallprompt'),
    backgroundAudio: has(nav, 'mediaSession'),
    wakeLock: has(nav, 'wakeLock'),
    webShare: has(nav, 'share') && has(nav, 'canShare'),
    microphone: has(media, 'getUserMedia'),
  };
}

export class WebPlatformAdapter implements PlatformAdapter {
  readonly kind = 'web' as const;
  readonly capabilities: Capabilities;

  constructor(private readonly env: DetectEnv) {
    this.capabilities = detectCapabilities(env);
  }

  listAudioSources(): Promise<readonly AudioSourceDescriptor[]> {
    const list: AudioSourceDescriptor[] = [
      { kind: 'demo', id: 'demo' },
      { kind: 'file', id: 'file' },
    ];
    if (this.capabilities.tabAudioCapture) list.push({ kind: 'tab', id: 'tab' });
    return Promise.resolve(list);
  }

  startCapture(source: AudioSourceDescriptor): Promise<MediaStream> {
    return Promise.reject(new UnsupportedFeatureError(`capture:${source.kind}`));
  }

  /**
   * Download fallback: an object URL on a temporary link. The File System Access save picker is
   * used for long exports in M05, where streaming matters.
   */
  saveFile(data: Blob, options: SaveFileOptions): Promise<SaveResult> {
    const doc = this.env.document;
    const typed = data.type ? data : new Blob([data], { type: options.mimeType });
    const url = URL.createObjectURL(typed);
    const a = doc.createElement('a');
    a.href = url;
    a.download = options.suggestedName;
    a.rel = 'noopener';
    a.style.display = 'none';
    doc.body.append(a);
    a.click();
    a.remove();
    // Revoke later: some browsers read the URL after click() returns.
    this.env.window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
    return Promise.resolve('saved');
  }

  openFile(options: OpenFileOptions): Promise<File | null> {
    const doc = this.env.document;
    return new Promise((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = options.accept;
      input.addEventListener('change', () => {
        resolve(input.files?.[0] ?? null);
      });
      input.addEventListener('cancel', () => {
        resolve(null);
      });
      input.click();
    });
  }

  showFloatingCaptions(): Promise<void> {
    return Promise.reject(new UnsupportedFeatureError('floatingCaptions'));
  }

  hideFloatingCaptions(): Promise<void> {
    return Promise.resolve();
  }

  async requestPersistentStorage(): Promise<PersistResult> {
    const storage = this.env.navigator.storage as StorageManager | undefined;
    if (!storage || typeof storage.persist !== 'function') return 'unsupported';
    try {
      if (await storage.persisted()) return 'granted';
      return (await storage.persist()) ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  openExternal(url: string): Promise<void> {
    if (!/^https:\/\//.test(url) && !/^mailto:/.test(url)) {
      return Promise.reject(new Error('only https and mailto links open externally'));
    }
    this.env.window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve();
  }
}
