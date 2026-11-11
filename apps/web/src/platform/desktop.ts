// DesktopPlatformAdapter (M12): the desktop app's capabilities over window.clearlyDesktop, the
// preload bridge. Everything the bridge cannot do falls back to the web adapter's behaviour.

import type { ClearlyDesktopBridge, LoopbackSupport } from '@clearly/core/desktop';
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
import { detectCapabilities, WebPlatformAdapter, type DetectEnv } from './web.ts';

/** Window event for tray and shortcut commands: detail is 'enhanced', 'original' or 'toggle'. */
export const DESKTOP_MODE_EVENT = 'clearly:desktop-mode';

/** Raw capture settings for system sound and virtual cables: no voice processing. */
export const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

export class DesktopPlatformAdapter implements PlatformAdapter {
  readonly kind = 'desktop' as const;
  readonly capabilities: Capabilities;
  readonly bridge: ClearlyDesktopBridge;
  private readonly web: WebPlatformAdapter;
  private readonly env: DetectEnv;
  private loopback: Promise<LoopbackSupport> | null = null;

  constructor(bridge: ClearlyDesktopBridge, env: DetectEnv) {
    this.bridge = bridge;
    this.env = env;
    this.web = new WebPlatformAdapter(env);
    const web = detectCapabilities(env);
    this.capabilities = {
      ...web,
      // Electron has no tab picker; system sound and virtual cables take its place.
      tabAudioCapture: false,
      systemAudioCapture: true,
      virtualCableRouting: web.microphone && web.outputDeviceSelection,
      nativeFileDialogs: true,
      floatingCaptions: true,
      installPrompt: false,
    };
  }

  /** Whether system sound works on this computer (asked once). */
  loopbackSupport(): Promise<LoopbackSupport> {
    this.loopback ??= this.bridge
      .getLoopbackSupport()
      .catch((): LoopbackSupport => ({ os: 'other', system: false, withMute: false }));
    return this.loopback;
  }

  async listAudioSources(): Promise<readonly AudioSourceDescriptor[]> {
    const list: AudioSourceDescriptor[] = [
      { kind: 'demo', id: 'demo' },
      { kind: 'file', id: 'file' },
    ];
    if ((await this.loopbackSupport()).system) list.push({ kind: 'system', id: 'system' });
    if (this.capabilities.virtualCableRouting) list.push({ kind: 'cable', id: 'cable' });
    return list;
  }

  /** System sound: the main process grants a screen with loopback audio; the picture is dropped. */
  async startCapture(source: AudioSourceDescriptor): Promise<MediaStream> {
    const md = this.env.navigator.mediaDevices;
    if (source.kind === 'system') {
      const stream = await md.getDisplayMedia({ video: true, audio: { ...RAW_AUDIO } });
      for (const v of stream.getVideoTracks()) {
        v.stop();
        stream.removeTrack(v);
      }
      if (stream.getAudioTracks().length === 0) {
        throw new UnsupportedFeatureError('capture:system');
      }
      return stream;
    }
    if (source.kind === 'cable') {
      return md.getUserMedia({
        audio: { deviceId: { exact: source.id }, ...RAW_AUDIO },
        video: false,
      });
    }
    throw new UnsupportedFeatureError(`capture:${source.kind}`);
  }

  async saveFile(data: Blob, options: SaveFileOptions): Promise<SaveResult> {
    return this.bridge.saveFile({
      suggestedName: options.suggestedName,
      mimeType: options.mimeType,
      data: new Uint8Array(await data.arrayBuffer()),
    });
  }

  async openFile(options: OpenFileOptions): Promise<File | null> {
    const r = await this.bridge.openFile({ accept: options.accept });
    return r ? new File([r.data], r.name, { type: r.type }) : null;
  }

  async showFloatingCaptions(): Promise<void> {
    await this.bridge.showFloatingCaptions();
  }

  async hideFloatingCaptions(): Promise<void> {
    await this.bridge.hideFloatingCaptions();
  }

  requestPersistentStorage(): Promise<PersistResult> {
    return this.web.requestPersistentStorage();
  }

  /** The main process opens https links in the default browser (window.open is routed there). */
  openExternal(url: string): Promise<void> {
    return this.web.openExternal(url);
  }
}

export function isDesktopAdapter(p: PlatformAdapter): p is DesktopPlatformAdapter {
  return p.kind === 'desktop';
}
