#!/usr/bin/env bash
# LGPL-2.1 section 6(d): writes the complete corresponding source of Clearly's video tool to
# apps/web/public/heavy/ffmpeg/source/, next to the core it describes, so it is offered from the
# same place. Needs no compiler: it downloads FFmpeg's release tarball (checksum-verified) and
# copies the patch, bindings, build script, licences and the exact configuration (BUILD-INFO.txt,
# written by build.sh). Run by build.sh, and by fetch:heavy when the core was downloaded.
set -euo pipefail

FFMPEG_VERSION=5.1.10
FFMPEG_SHA256=392306d6fc45dab0e9e0ea55381e071842e83a2fb31d320aeda40477a7766293
FFMPEG_URL="https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"
EXPECTED_EMCC=7.0.0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CACHE="$ROOT/node_modules/.cache/ffmpeg-wasm"
OUT="$ROOT/apps/web/public/heavy/ffmpeg"
SRC_OUT="$OUT/source"
TARBALL="$CACHE/ffmpeg-${FFMPEG_VERSION}.tar.xz"

sha256() { if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1; }

mkdir -p "$CACHE"
if [ ! -f "$TARBALL" ] || [ "$(sha256 "$TARBALL")" != "$FFMPEG_SHA256" ]; then
  echo "ffmpeg source: downloading $FFMPEG_URL"
  curl -fsSL -o "$TARBALL.tmp" "$FFMPEG_URL"
  if [ "$(sha256 "$TARBALL.tmp")" != "$FFMPEG_SHA256" ]; then
    rm -f "$TARBALL.tmp"
    echo "ffmpeg source: checksum mismatch for $FFMPEG_URL" >&2
    exit 1
  fi
  mv "$TARBALL.tmp" "$TARBALL"
fi

rm -rf "$SRC_OUT"
mkdir -p "$SRC_OUT"
cp "$TARBALL" "$SRC_OUT/"
cp "$HERE/fftools-${FFMPEG_VERSION}-wasm.patch" "$HERE/bind.js" "$HERE/build.sh" \
  "$HERE/source-bundle.sh" "$HERE/LICENSE-ffmpeg.wasm" "$HERE/BUILD-INFO.txt" "$SRC_OUT/"
tar -xJf "$TARBALL" -C "$SRC_OUT" --strip-components=1 "ffmpeg-${FFMPEG_VERSION}/COPYING.LGPLv2.1"
mv "$SRC_OUT/COPYING.LGPLv2.1" "$SRC_OUT/COPYING.LGPLv2.1.txt"
cat > "$SRC_OUT/README.txt" <<README
Clearly's video tool is FFmpeg ${FFMPEG_VERSION}, compiled to WebAssembly. FFmpeg is free software
under the GNU Lesser General Public License, version 2.1 or later (COPYING.LGPLv2.1.txt). You
may replace the video tool with your own build.

This folder holds everything needed to rebuild it exactly:
  ffmpeg-${FFMPEG_VERSION}.tar.xz        FFmpeg's release tarball from https://ffmpeg.org/releases/
                                SHA-256 ${FFMPEG_SHA256}
  fftools-${FFMPEG_VERSION}-wasm.patch   changes to FFmpeg's command-line tools (from ffmpeg.wasm, MIT)
  bind.js                       JavaScript bindings (from ffmpeg.wasm 0.12.15, MIT)
  LICENSE-ffmpeg.wasm           ffmpeg.wasm's MIT licence
  build.sh                      the build script (Emscripten ${EXPECTED_EMCC})
  source-bundle.sh              writes this folder
  BUILD-INFO.txt                the exact configuration
README
{
  echo '<!doctype html><meta charset="utf-8"><title>Video tool source</title><ul>'
  for f in "$SRC_OUT"/*; do
    n="$(basename "$f")"
    echo "<li><a href=\"$n\">$n</a></li>"
  done
  echo '</ul>'
} > "$SRC_OUT/index.html"
echo "ffmpeg source: written to apps/web/public/heavy/ffmpeg/source/"
