// Heavy-asset manifest handling: schema, safe destinations, checksum verification and download.
// Assets land under apps/web/public/heavy/ and are served from the app's own origin.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';

export const HEAVY_ROOT = 'apps/web/public/heavy';

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters');

export const HeavyAsset = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    /** Where a downloaded asset comes from (pinned, https only). */
    url: z.url({ protocol: /^https$/ }).optional(),
    /**
     * Or a build script, relative to the repository root, that produces the file from pinned and
     * checksummed sources (the LGPL ffmpeg.wasm core). The checksum is still verified.
     */
    build: z
      .string()
      .regex(/^scripts\/[A-Za-z0-9._/-]+\.sh$/, 'build must be a script under scripts/')
      .optional(),
    sha256: sha256Hex,
    /** Exact size in bytes, shown to the person before they download. */
    bytes: z.number().int().positive(),
    destination: z.string().min(1),
    licence: z.string().min(1),
  })
  .refine((a) => a.url !== undefined || a.build !== undefined, {
    message: 'an asset needs a url, a build script, or both',
  });
export type HeavyAsset = z.infer<typeof HeavyAsset>;

export const HeavyManifest = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(HeavyAsset),
});
export type HeavyManifest = z.infer<typeof HeavyManifest>;

export function parseManifest(json: unknown): HeavyManifest {
  const manifest = HeavyManifest.parse(json);
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    const dest = resolveDestination(process.cwd(), asset.destination);
    if (seen.has(dest)) throw new Error(`Two assets share the destination ${asset.destination}`);
    seen.add(dest);
  }
  return manifest;
}

/** Resolves a manifest destination and refuses anything outside apps/web/public/heavy/. */
export function resolveDestination(repoRoot: string, destination: string): string {
  const root = resolve(repoRoot, HEAVY_ROOT);
  const full = resolve(root, destination);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Destination ${destination} must be a file inside ${HEAVY_ROOT}/`);
  }
  return full;
}

export function sha256OfBuffer(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function sha256OfFile(path: string): Promise<string | null> {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return hash.digest('hex');
}

export type FetchOutcome = 'already-present' | 'downloaded';

/** A built asset (not downloaded) is missing or does not match its checksum. */
export class BuildRequiredError extends Error {
  readonly asset: HeavyAsset;
  constructor(asset: HeavyAsset, actual: string | null) {
    super(
      actual === null
        ? `${asset.name}: not built yet. Run ${asset.build ?? 'its build script'}.`
        : `${asset.name} ${asset.version}: checksum mismatch.\n  expected ${asset.sha256}\n  found    ${actual}\n  Rebuild with ${asset.build ?? 'its build script'} (the pinned Emscripten version) or update heavy-manifest.json.`,
    );
    this.name = 'BuildRequiredError';
    this.asset = asset;
  }
}

/**
 * Downloads one asset, verifies its SHA-256 and moves it into place atomically.
 * On a checksum mismatch nothing is written and an error is thrown.
 */
export async function fetchAsset(
  repoRoot: string,
  asset: HeavyAsset,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const dest = resolveDestination(repoRoot, asset.destination);
  const existing = await sha256OfFile(dest);
  if (existing === asset.sha256) return 'already-present';
  if (asset.url === undefined) throw new BuildRequiredError(asset, existing);

  let response: Response;
  try {
    response = await fetchImpl(asset.url, { redirect: 'follow' });
  } catch (error) {
    // A built asset's url is a prebuilt copy (a release download); without it, build it.
    if (asset.build) throw new BuildRequiredError(asset, existing);
    throw error;
  }
  if (!response.ok && asset.build) throw new BuildRequiredError(asset, existing);
  if (!response.ok) {
    throw new Error(
      `${asset.name}: download failed with HTTP ${response.status} from ${asset.url}`,
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  const actual = sha256OfBuffer(data);
  if (actual !== asset.sha256) {
    throw new Error(
      `${asset.name} ${asset.version}: checksum mismatch.\n  expected ${asset.sha256}\n  received ${actual}`,
    );
  }
  if (data.length !== asset.bytes) {
    throw new Error(
      `${asset.name} ${asset.version}: size mismatch, expected ${asset.bytes} bytes, received ${data.length}`,
    );
  }
  await mkdir(dirname(dest), { recursive: true });
  const temp = `${dest}.${process.pid}.tmp`;
  try {
    await writeFile(temp, data);
    await rename(temp, dest);
  } finally {
    await rm(temp, { force: true });
  }
  return 'downloaded';
}
