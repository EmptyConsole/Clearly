// Collects encoded bytes into a Blob without keeping one large ArrayBuffer: parts are folded into
// Blobs every few megabytes, which the browser may keep outside the JavaScript heap. The first
// HEAD_BYTES stay in a mutable buffer so a container can patch its header at the end (the MP3
// Xing frame, written at position 0 after encoding).

const HEAD_BYTES = 64 * 1024;
const FOLD_BYTES = 8 * 1024 * 1024;

export class PatchableBlobWriter {
  private readonly head = new Uint8Array(HEAD_BYTES);
  private headUsed = 0;
  private parts: BlobPart[] = [];
  private pending: Uint8Array<ArrayBuffer>[] = [];
  private pendingBytes = 0;
  private length = 0;

  get size(): number {
    return this.length;
  }

  write(data: Uint8Array, position: number = this.length): void {
    if (position === this.length) {
      this.append(data);
      return;
    }
    if (position + data.length <= this.headUsed) {
      this.head.set(data, position);
      return;
    }
    throw new Error(
      `cannot write ${data.length} bytes at ${position}: only the header can be patched`,
    );
  }

  private append(data: Uint8Array): void {
    let offset = 0;
    if (this.headUsed < HEAD_BYTES) {
      const n = Math.min(HEAD_BYTES - this.headUsed, data.length);
      this.head.set(data.subarray(0, n), this.headUsed);
      this.headUsed += n;
      offset = n;
    }
    if (offset < data.length) {
      const rest = data.slice(offset);
      this.pending.push(rest);
      this.pendingBytes += rest.length;
      if (this.pendingBytes >= FOLD_BYTES) this.fold();
    }
    this.length += data.length;
  }

  private fold(): void {
    if (this.pending.length === 0) return;
    this.parts.push(new Blob(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }

  /** The whole file, optionally preceded by `prefix` (a header computed at the end). */
  toBlob(type: string, prefix?: Uint8Array<ArrayBuffer>): Blob {
    this.fold();
    const head = this.head.slice(0, this.headUsed);
    return new Blob(prefix ? [prefix, head, ...this.parts] : [head, ...this.parts], { type });
  }
}
