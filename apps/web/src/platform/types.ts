// PlatformAdapter (RULES.md): one interface for what the platform can do. Components read
// `capabilities` from React context and render the right UI or an honest explanation. Never branch
// on browser names or user-agent strings.

export interface Capabilities {
  readonly tabAudioCapture: boolean;
  readonly systemAudioCapture: boolean;
  readonly virtualCableRouting: boolean;
  readonly outputDeviceSelection: boolean;
  readonly nativeFileDialogs: boolean;
  readonly floatingCaptions: boolean;
  readonly installPrompt: boolean;
  readonly backgroundAudio: boolean;
  readonly wakeLock: boolean;
  readonly webShare: boolean;
  readonly microphone: boolean;
}

export type AudioSourceKind = 'demo' | 'file' | 'tab' | 'system' | 'cable';

export interface AudioSourceDescriptor {
  readonly kind: AudioSourceKind;
  readonly id: string;
}

export interface SaveFileOptions {
  readonly suggestedName: string;
  readonly mimeType: string;
}

export type SaveResult = 'saved' | 'cancelled';

export interface OpenFileOptions {
  readonly accept: string;
}

export type PersistResult = 'granted' | 'denied' | 'unsupported';

export interface PlatformAdapter {
  readonly kind: 'web' | 'desktop';
  readonly capabilities: Capabilities;
  listAudioSources(): Promise<readonly AudioSourceDescriptor[]>;
  /** Starts capture for a source and returns its stream (M05 and M12). */
  startCapture(source: AudioSourceDescriptor): Promise<MediaStream>;
  saveFile(data: Blob, options: SaveFileOptions): Promise<SaveResult>;
  openFile(options: OpenFileOptions): Promise<File | null>;
  showFloatingCaptions(): Promise<void>;
  hideFloatingCaptions(): Promise<void>;
  requestPersistentStorage(): Promise<PersistResult>;
  openExternal(url: string): Promise<void>;
}

/** Thrown by methods whose feature this platform does not have; the UI explains the alternative. */
export class UnsupportedFeatureError extends Error {
  override readonly name = 'UnsupportedFeatureError';
  constructor(readonly feature: string) {
    super(`${feature} is not available on this platform`);
  }
}
