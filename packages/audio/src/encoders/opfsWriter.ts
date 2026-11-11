// Writes an encoded file straight into the Origin Private File System from a worker, so a long
// temporary WAV (video export, M11) stays on disk instead of in the JavaScript heap. Uses the
// synchronous access handle, which exists only in dedicated workers. Returns null where OPFS or the
// sync handle is missing; the caller then falls back to PatchableBlobWriter.

/** The OPFS folder for Clearly's temporary export files. */
export const OPFS_TEMP_DIR = 'clearly-export-tmp';

interface SyncHandle {
  write(data: Uint8Array, options?: { at: number }): number;
  flush(): void;
  close(): void;
  truncate(size: number): void;
}

export class OpfsWriter {
  private position = 0;
  private closed = false;

  private constructor(
    private readonly dir: FileSystemDirectoryHandle,
    private readonly file: FileSystemFileHandle,
    private readonly handle: SyncHandle,
    readonly name: string,
  ) {}

  static async open(name: string): Promise<OpfsWriter | null> {
    try {
      if (typeof navigator === 'undefined' || !('storage' in navigator)) return null;
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(OPFS_TEMP_DIR, { create: true });
      const file = await dir.getFileHandle(name, { create: true });
      if (!('createSyncAccessHandle' in file)) return null;
      const handle = await (
        file as FileSystemFileHandle & { createSyncAccessHandle: () => Promise<SyncHandle> }
      ).createSyncAccessHandle();
      handle.truncate(0);
      return new OpfsWriter(dir, file, handle, name);
    } catch {
      return null;
    }
  }

  get size(): number {
    return this.position;
  }

  /** Appends, or patches earlier bytes when `at` is given (a header written at the end). */
  write(data: Uint8Array, at?: number): void {
    if (at !== undefined) {
      this.handle.write(data, { at });
      return;
    }
    this.handle.write(data, { at: this.position });
    this.position += data.length;
  }

  /** Closes the handle and returns the file, which reads from disk. */
  async finish(): Promise<File> {
    this.handle.flush();
    this.handle.close();
    this.closed = true;
    return this.file.getFile();
  }

  async remove(): Promise<void> {
    if (!this.closed) {
      try {
        this.handle.close();
      } catch {
        // Already closed.
      }
      this.closed = true;
    }
    try {
      await this.dir.removeEntry(this.name);
    } catch {
      // Already gone.
    }
  }
}
