#!/usr/bin/env bash
# pnpm build:ffmpeg: builds Clearly's own ffmpeg.wasm single-thread core (LGPL-2.1-or-later).
#
# Why a local build: every prebuilt ffmpeg.wasm core is configured with --enable-gpl (and one with
# --enable-nonfree). M11 needs only stream copy, the native AAC encoder, text subtitle conversion
# and the MP4/MOV/Matroska/WebM (de)muxers, which plain FFmpeg provides under the LGPL. See
# docs/DECISIONS.txt (M11) and assets/LICENSES.txt.
#
# Inputs (pinned and checksummed):
#   - FFmpeg 5.1.10 release tarball from ffmpeg.org.
#   - scripts/ffmpeg-wasm/fftools-5.1.10-wasm.patch: ffmpeg.wasm 0.12.15's changes to fftools
#     (ffmpeg() and ffprobe() callable more than once, progress events, abort instead of exit),
#     rebased onto 5.1.10 keeping 5.1.x's codec_tag bounds fix. ffmpeg.wasm is MIT (LICENSE-ffmpeg.wasm).
#   - scripts/ffmpeg-wasm/bind.js: ffmpeg.wasm 0.12.15's JavaScript bindings (MIT), plus one marked
#     addition that lists WORKERFS on FS.filesystems again for newer Emscripten.
# Output: apps/web/public/heavy/ffmpeg/ffmpeg-core.{js,wasm}, an ES module for @ffmpeg/ffmpeg 0.12.15.
# The script refuses to finish if the configured licence is anything other than LGPL.
#
# Needs Emscripten (tested with 7.0.0: `brew install emscripten`). Takes 5 to 15 minutes.

set -euo pipefail

FFMPEG_VERSION=5.1.10
FFMPEG_SHA256=392306d6fc45dab0e9e0ea55381e071842e83a2fb31d320aeda40477a7766293
FFMPEG_URL="https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"
EXPECTED_EMCC=7.0.0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CACHE="$ROOT/node_modules/.cache/ffmpeg-wasm"
SRC="$CACHE/ffmpeg-${FFMPEG_VERSION}"
OUT="$ROOT/apps/web/public/heavy/ffmpeg"

command -v emcc >/dev/null || { echo "build:ffmpeg: emcc not found. Install Emscripten (brew install emscripten)." >&2; exit 1; }
EMCC_VERSION="$(emcc -dumpversion 2>/dev/null | sed 's/-.*//')"
if [ "$EMCC_VERSION" != "$EXPECTED_EMCC" ]; then
  echo "build:ffmpeg: warning: emcc $EMCC_VERSION, tested with $EXPECTED_EMCC. The output checksum will differ from heavy-manifest.json." >&2
fi

mkdir -p "$CACHE"
TARBALL="$CACHE/ffmpeg-${FFMPEG_VERSION}.tar.xz"
if [ ! -f "$TARBALL" ] || [ "$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)" != "$FFMPEG_SHA256" ]; then
  echo "build:ffmpeg: downloading $FFMPEG_URL"
  curl -fsSL -o "$TARBALL.tmp" "$FFMPEG_URL"
  ACTUAL="$(shasum -a 256 "$TARBALL.tmp" | cut -d' ' -f1)"
  if [ "$ACTUAL" != "$FFMPEG_SHA256" ]; then
    rm -f "$TARBALL.tmp"
    echo "build:ffmpeg: checksum mismatch for $FFMPEG_URL: expected $FFMPEG_SHA256, got $ACTUAL" >&2
    exit 1
  fi
  mv "$TARBALL.tmp" "$TARBALL"
fi

rm -rf "$SRC"
tar -xJf "$TARBALL" -C "$CACHE"
cd "$SRC"
patch -p1 --forward < "$HERE/fftools-${FFMPEG_VERSION}-wasm.patch"

# Only what video export needs. Everything else stays off, including every external library, so the
# licence is LGPL-2.1-or-later. Decoders for the video codecs are present only so that probing fills
# in stream parameters (profile, pixel format) the MP4 muxer writes; the video is never re-encoded.
# Component names are configure's (for example movtext, not mov_text); configure ignores a name it
# does not know, so each one is checked in config.h below.
PROTOCOLS=file,pipe
DEMUXERS=mov,matroska,avi,mpegts,wav,srt,webvtt,ass
MUXERS=mp4,mov,matroska,webm,framemd5,null,wav,srt,webvtt
DECODERS=h264,hevc,vp8,vp9,mpeg4,pcm_s16le,pcm_f32le,aac,opus,movtext,subrip,srt,webvtt,ass,ssa
ENCODERS=aac,pcm_s16le,movtext,subrip,srt,webvtt,ass
PARSERS=h264,hevc,vp8,vp9,av1,mpeg4video,aac,opus
FILTERS=aresample,aformat,anull,null,format,atrim,trim,acopy,copy

CONF_FLAGS=(
  --target-os=none --arch=x86_32 --enable-cross-compile
  --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug
  --disable-runtime-cpudetect --disable-autodetect --disable-network
  --disable-pthreads --disable-w32threads --disable-os2threads
  --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc
  --extra-cflags="-O3"
  --disable-everything
  --disable-postproc --disable-avdevice
  --enable-protocol=$PROTOCOLS
  --enable-demuxer=$DEMUXERS
  --enable-muxer=$MUXERS
  --enable-decoder=$DECODERS
  --enable-encoder=$ENCODERS
  --enable-parser=$PARSERS
  --enable-bsfs
  --enable-filter=$FILTERS
  --enable-swresample
)

echo "build:ffmpeg: configuring FFmpeg $FFMPEG_VERSION"
emconfigure ./configure "${CONF_FLAGS[@]}" | tee "$CACHE/configure.log"
LICENSE_LINE="$(grep -E '^License:' "$CACHE/configure.log" || true)"
if ! grep -q '^#define CONFIG_GPL 0' config.h || ! grep -q '^#define CONFIG_NONFREE 0' config.h \
  || ! grep -q '^#define CONFIG_VERSION3 0' config.h || [[ "$LICENSE_LINE" != *"LGPL version 2.1 or later"* ]]; then
  echo "build:ffmpeg: refusing to continue: the configured licence is not LGPL-2.1-or-later ($LICENSE_LINE)" >&2
  exit 1
fi

MISSING=()
check_enabled() { # list, suffix
  local name
  for name in ${1//,/ }; do
    local macro
    macro="CONFIG_$(echo "$name" | tr '[:lower:]' '[:upper:]')_$2"
    grep -q "^#define $macro 1" config_components.h || MISSING+=("$macro")
  done
}
check_enabled "$PROTOCOLS" PROTOCOL
check_enabled "$DEMUXERS" DEMUXER
check_enabled "$MUXERS" MUXER
check_enabled "$DECODERS" DECODER
check_enabled "$ENCODERS" ENCODER
check_enabled "$PARSERS" PARSER
check_enabled "$FILTERS" FILTER
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "build:ffmpeg: these components were requested but are not enabled: ${MISSING[*]}" >&2
  exit 1
fi

echo "build:ffmpeg: compiling libraries"
emmake make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

mkdir -p "$OUT"
echo "build:ffmpeg: linking the core"
emcc -O3 \
  -I. -I./fftools \
  -Llibavcodec -Llibavfilter -Llibavformat -Llibavutil -Llibswresample -Llibswscale \
  fftools/cmdutils.c fftools/ffmpeg.c fftools/ffmpeg_filter.c fftools/ffmpeg_hw.c \
  fftools/ffmpeg_mux.c fftools/ffmpeg_opt.c fftools/opt_common.c fftools/ffprobe.c \
  -lavfilter -lavformat -lavcodec -lswresample -lswscale -lavutil \
  -Wno-deprecated-declarations \
  -sENVIRONMENT=worker \
  -sWASM_BIGINT \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createFFmpegCore \
  -sINITIAL_MEMORY=32MB -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=2GB \
  -sSTACK_SIZE=5MB \
  -sEXPORTED_FUNCTIONS=_ffmpeg,_abort,_malloc,_ffprobe \
  -sEXPORTED_RUNTIME_METHODS=FS,setValue,getValue,UTF8ToString,lengthBytesUTF8,stringToUTF8 \
  -lworkerfs.js \
  --pre-js "$HERE/bind.js" \
  -o "$OUT/ffmpeg-core.js"

{
  echo "Clearly ffmpeg.wasm core: FFmpeg $FFMPEG_VERSION, emcc $EMCC_VERSION"
  echo "$LICENSE_LINE"
  grep -E '^#define FFMPEG_CONFIGURATION' config.h
} > "$OUT/BUILD-INFO.txt"

# Keep the exact configuration in the repository too: source-bundle.sh publishes it.
cp "$OUT/BUILD-INFO.txt" "$HERE/BUILD-INFO.txt"
# LGPL-2.1 section 6(d): the complete corresponding source next to the core.
bash "$HERE/source-bundle.sh"

echo "build:ffmpeg: done"
for f in ffmpeg-core.js ffmpeg-core.wasm; do
  printf '%s  %s bytes  %s\n' "$(shasum -a 256 "$OUT/$f" | cut -d' ' -f1)" "$(wc -c < "$OUT/$f" | tr -d ' ')" "$f"
done
