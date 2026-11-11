// Test-build globals the app sets (apps/web/src/test/hooks.ts), as the e2e tests see them.
interface Window {
  __clearlyTest?: Record<string, unknown> & {
    fakeMic?: { levelDbfs: number } | 'echo';
  };
  __clearlyHumLog?: (number | null)[];
  __clearlyDin?: { triplet: readonly number[] | null };
  __clearlyPlayer?: {
    graph: {
      taps: { analyser: AnalyserNode };
      plan: {
        hum: readonly { frequencyHz: number; on: boolean }[];
        ears: { left: { ambientDb: number } };
        compressor: { thresholdDbfs: number };
      };
    } | null;
    reference: (() => Promise<Blob>) | null;
  };
  /** M11 video test hooks (apps/web/src/test/videoHooks.ts). */
  __clearlyVideo?: {
    makeFixture(
      kind: 'h264-aac-mp4' | 'vp9-opus-webm' | 'vp8-opus-webm' | 'h264-opus-subs-mkv',
      seconds: number,
    ): Promise<{ name: string; bytes: Uint8Array }>;
    run(
      files: readonly { name: string; bytes: Uint8Array }[],
      args: readonly string[],
      output?: string,
    ): Promise<{ code: number; log: string[]; output: Uint8Array | null }>;
    probe(file: { name: string; bytes: Uint8Array }): Promise<string>;
    tempFiles(): Promise<string[]>;
    makeLargeFixture(megabytes: number): Promise<{ bytes: number; seconds: number }>;
    exportLarge(): Promise<{ bytes: number; container: string; seconds: number }>;
    removeLarge(): Promise<void>;
  };
}
