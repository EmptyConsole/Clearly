// pnpm fetch:heavy: downloads every asset in heavy-manifest.json into apps/web/public/heavy/,
// verifying each SHA-256. Fails on any mismatch or download error.
// Built assets (with "build"; the LGPL video tool) are downloaded from their prebuilt copy when the
// manifest names one, and built with their script otherwise, then verified the same way. Where
// neither is possible (no Emscripten, for example on a hosting provider's build machine) and
// HEAVY_SKIP_UNAVAILABLE=1 is set, the asset is skipped with a warning: the app explains that the
// download failed and everything else works.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { BuildRequiredError, fetchAsset, parseManifest } from './lib/heavy.ts';

const repoRoot = process.cwd();
const manifest = parseManifest(JSON.parse(await readFile('heavy-manifest.json', 'utf8')));
const skipUnavailable = process.env['HEAVY_SKIP_UNAVAILABLE'] === '1';

if (manifest.assets.length === 0) {
  console.log('fetch:heavy: heavy-manifest.json lists no assets yet. Nothing to download.');
  process.exit(0);
}

const hasEmcc = (): boolean => spawnSync('emcc', ['--version'], { stdio: 'ignore' }).status === 0;

let failed = 0;
let skipped = 0;
const built = new Set<string>();
for (const asset of manifest.assets) {
  try {
    let outcome;
    try {
      outcome = await fetchAsset(repoRoot, asset);
    } catch (error) {
      if (!(error instanceof BuildRequiredError) || !asset.build) throw error;
      if (built.has(asset.build)) throw error;
      if (!hasEmcc()) {
        if (skipUnavailable) {
          skipped += 1;
          console.warn(
            `fetch:heavy: SKIPPED ${asset.name}: no prebuilt copy could be downloaded and Emscripten is not installed. The feature that needs it will say its download failed.`,
          );
          continue;
        }
        throw error;
      }
      console.log(`${asset.name}: building with ${asset.build}`);
      built.add(asset.build);
      const run = spawnSync('bash', [asset.build], { cwd: repoRoot, stdio: 'inherit' });
      if (run.status !== 0)
        throw new Error(`${asset.build} failed (exit ${String(run.status ?? 'signal')})`, {
          cause: error,
        });
      outcome = await fetchAsset(repoRoot, asset);
    }
    console.log(
      `${asset.name} ${asset.version}: ${outcome === 'downloaded' ? 'downloaded and verified' : 'already present, checksum matches'}`,
    );
  } catch (error) {
    failed += 1;
    console.error(error instanceof Error ? error.message : String(error));
  }
}

// LGPL-2.1 section 6(d): wherever the video tool is served, its source is served beside it.
const core = 'apps/web/public/heavy/ffmpeg/ffmpeg-core.wasm';
const source = 'apps/web/public/heavy/ffmpeg/source/index.html';
if (existsSync(core) && !existsSync(source)) {
  const run = spawnSync('bash', ['scripts/ffmpeg-wasm/source-bundle.sh'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    failed += 1;
    console.error('fetch:heavy: the video tool source folder could not be written');
  }
}

if (skipped > 0) console.warn(`fetch:heavy: ${skipped} asset(s) skipped (HEAVY_SKIP_UNAVAILABLE).`);
if (failed > 0) {
  console.error(`fetch:heavy: ${failed} of ${manifest.assets.length} asset(s) failed.`);
  process.exit(1);
}
