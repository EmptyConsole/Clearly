// File hash for the caption cache: SHA-256 over the first 1 MB, the last 1 MB and the file size
// (as a decimal string). Reading only 2 MB makes hashing a multi-gigabyte video instant, and the
// size plus both ends distinguish real-world files reliably. Two files that differ only in their
// middle bytes and have the same size would collide; for a cache of captions that is acceptable,
// and documented in docs/DECISIONS.txt (M04).

export const HASH_EDGE_BYTES = 1024 * 1024;

export async function fileHash(file: Blob): Promise<string> {
  const head = file.slice(0, Math.min(HASH_EDGE_BYTES, file.size));
  const tailStart = Math.max(HASH_EDGE_BYTES, file.size - HASH_EDGE_BYTES);
  const tail = file.slice(Math.min(tailStart, file.size));
  const size = new TextEncoder().encode(String(file.size));
  const parts = [
    new Uint8Array(await head.arrayBuffer()),
    new Uint8Array(await tail.arrayBuffer()),
    size,
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return `sha256-${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
