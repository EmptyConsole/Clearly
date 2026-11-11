// Video export (M11): what goes into the output and in which container, decided from ffprobe's
// JSON for the input (never from the file name extension). Pure functions, unit-tested.

export interface ProbeStream {
  readonly index: number;
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly disposition?: Readonly<Record<string, number>>;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface Probe {
  readonly streams: readonly ProbeStream[];
  readonly format?: {
    readonly format_name?: string;
    readonly duration?: string;
    readonly tags?: Readonly<Record<string, string>>;
  };
}

export type Container = 'mp4' | 'mkv';

/** Video codecs that ffmpeg's MP4 muxer accepts with a standard sample entry. */
export const MP4_VIDEO_CODECS: ReadonlySet<string> = new Set([
  'h264',
  'hevc',
  'av1',
  'vp9',
  'mpeg4',
]);
/** Text subtitles: converted to mov_text for MP4; copied (or converted to SubRip) for MKV. */
export const TEXT_SUBTITLE_CODECS: ReadonlySet<string> = new Set([
  'mov_text',
  'subrip',
  'srt',
  'ass',
  'ssa',
  'webvtt',
  'text',
]);

export interface MuxPlan {
  readonly container: Container;
  /** Input video streams kept, copied untouched. */
  readonly video: readonly number[];
  /** Subtitle streams kept, with the output codec ('copy' or a text encoder). */
  readonly subtitles: readonly { readonly index: number; readonly codec: string }[];
  /** Subtitle streams the container cannot hold (picture subtitles in MP4). */
  readonly droppedSubtitles: number;
  /** True when the input has an audio stream whose tags (language, title) the new audio keeps. */
  readonly hasSourceAudio: boolean;
  /**
   * File tags to set explicitly: Matroska tags with a target ("MOVIE/TITLE") that the MP4 muxer
   * would otherwise drop, under MP4's own names.
   */
  readonly metadata: Readonly<Record<string, string>>;
}

/** Matroska tag names that MP4 can hold, and their ffmpeg MP4 keys. */
const MKV_TO_MP4_TAGS: Readonly<Record<string, string>> = {
  TITLE: 'title',
  COMMENT: 'comment',
  ARTIST: 'artist',
  ALBUM: 'album',
  DATE_RELEASED: 'date',
  DATE: 'date',
  GENRE: 'genre',
  DESCRIPTION: 'description',
  COPYRIGHT: 'copyright',
};

function mp4Metadata(tags: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tags) return out;
  const lower = new Set(Object.keys(tags).map((k) => k.toLowerCase()));
  for (const [key, value] of Object.entries(tags)) {
    const name = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
    const mp4 = MKV_TO_MP4_TAGS[name.toUpperCase()];
    if (mp4 && !lower.has(mp4) && !(mp4 in out)) out[mp4] = value;
  }
  return out;
}

export class NoVideoError extends Error {
  constructor() {
    super('the file has no video stream');
    this.name = 'NoVideoError';
  }
}

const isAttachedPicture = (s: ProbeStream): boolean => s.disposition?.attached_pic === 1;

export function planMux(probe: Probe): MuxPlan {
  const videos = probe.streams.filter((s) => s.codec_type === 'video' && !isAttachedPicture(s));
  if (videos.length === 0) throw new NoVideoError();
  const container: Container = videos.every((s) => MP4_VIDEO_CODECS.has(s.codec_name ?? ''))
    ? 'mp4'
    : 'mkv';
  // Cover art (attached pictures) goes along in MKV only.
  const video = probe.streams
    .filter((s) => s.codec_type === 'video' && (container === 'mkv' || !isAttachedPicture(s)))
    .map((s) => s.index);

  const subtitles: { index: number; codec: string }[] = [];
  let droppedSubtitles = 0;
  for (const s of probe.streams) {
    if (s.codec_type !== 'subtitle') continue;
    const name = s.codec_name ?? '';
    const text = TEXT_SUBTITLE_CODECS.has(name);
    if (name === '' || name === 'none') {
      // A subtitle format this ffmpeg build cannot identify cannot be copied either.
      droppedSubtitles += 1;
    } else if (container === 'mp4') {
      if (text)
        subtitles.push({ index: s.index, codec: name === 'mov_text' ? 'copy' : 'mov_text' });
      else droppedSubtitles += 1;
    } else {
      subtitles.push({ index: s.index, codec: name === 'mov_text' ? 'subrip' : 'copy' });
    }
  }
  return {
    container,
    video,
    subtitles,
    droppedSubtitles,
    hasSourceAudio: probe.streams.some((s) => s.codec_type === 'audio'),
    metadata: container === 'mp4' ? mp4Metadata(probe.format?.tags) : {},
  };
}

export const AAC_BITRATE = '192k';

/**
 * ffmpeg arguments: input 0 is the original file, input 1 the rendered WAV. The video is copied
 * untouched, the audio encoded with the native AAC encoder at 192 kbps, subtitles mapped where
 * the container allows, and the file, stream and chapter metadata kept.
 */
export function muxArgs(plan: MuxPlan, input: string, wav: string, output: string): string[] {
  const args = ['-hide_banner', '-i', input, '-i', wav];
  for (const i of plan.video) args.push('-map', `0:${i}`);
  args.push('-map', '1:a:0');
  for (const s of plan.subtitles) args.push('-map', `0:${s.index}`);
  args.push('-map_metadata', '0', '-map_chapters', '0');
  for (const [k, v] of Object.entries(plan.metadata)) args.push('-metadata', `${k}=${v}`);
  if (plan.hasSourceAudio) args.push('-map_metadata:s:a:0', '0:s:a:0');
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', AAC_BITRATE, '-disposition:a:0', 'default');
  plan.subtitles.forEach((s, k) => {
    args.push(`-c:s:${k}`, s.codec);
  });
  args.push('-f', plan.container === 'mp4' ? 'mp4' : 'matroska', output);
  return args;
}

export function videoOutputName(fileName: string, container: Container): string {
  return `${fileName.replace(/\.[^.]+$/, '')} (Clearly).${container}`;
}

/** Parses ffprobe's JSON, printed as lines on stdout. */
export function parseProbe(stdout: string): Probe {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('ffprobe printed no JSON');
  const json = JSON.parse(stdout.slice(start, end + 1)) as Partial<Probe>;
  return {
    streams: Array.isArray(json.streams) ? json.streams : [],
    ...(json.format ? { format: json.format } : {}),
  };
}
