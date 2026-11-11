import { describe, expect, it } from 'vitest';
import {
  muxArgs,
  NoVideoError,
  parseProbe,
  planMux,
  videoOutputName,
  type Probe,
  type ProbeStream,
} from './videoMux.ts';

const v = (index: number, codec: string, extra: Partial<ProbeStream> = {}): ProbeStream => ({
  index,
  codec_type: 'video',
  codec_name: codec,
  ...extra,
});
const a = (index: number, codec = 'aac'): ProbeStream => ({
  index,
  codec_type: 'audio',
  codec_name: codec,
});
const s = (index: number, codec?: string): ProbeStream => ({
  index,
  codec_type: 'subtitle',
  ...(codec ? { codec_name: codec } : {}),
});

describe('planMux: container from the probed video codec, not the file name extension', () => {
  it.each(['h264', 'hevc', 'av1', 'vp9', 'mpeg4'])('%s goes to MP4', (codec) => {
    expect(planMux({ streams: [v(0, codec), a(1)] }).container).toBe('mp4');
  });

  it.each(['vp8', 'theora', 'prores', 'mpeg2video'])('%s goes to MKV', (codec) => {
    expect(planMux({ streams: [v(0, codec), a(1)] }).container).toBe('mkv');
  });

  it('needs a video stream; cover art alone does not count', () => {
    expect(() => planMux({ streams: [a(0)] })).toThrow(NoVideoError);
    expect(() =>
      planMux({ streams: [a(0), v(1, 'mjpeg', { disposition: { attached_pic: 1 } })] }),
    ).toThrow(NoVideoError);
  });

  it('keeps cover art in MKV only', () => {
    const cover = v(2, 'mjpeg', { disposition: { attached_pic: 1 } });
    expect(planMux({ streams: [v(0, 'h264'), a(1), cover] }).video).toEqual([0]);
    expect(planMux({ streams: [v(0, 'vp8'), a(1), cover] }).video).toEqual([0, 2]);
  });
});

describe('planMux: subtitles where the container allows', () => {
  it('MP4: text is converted to mov_text (copied if it already is); pictures are left out', () => {
    const p = planMux({
      streams: [
        v(0, 'h264'),
        a(1),
        s(2, 'subrip'),
        s(3, 'mov_text'),
        s(4, 'hdmv_pgs_subtitle'),
        s(5, 'webvtt'),
      ],
    });
    expect(p.subtitles).toEqual([
      { index: 2, codec: 'mov_text' },
      { index: 3, codec: 'copy' },
      { index: 5, codec: 'mov_text' },
    ]);
    expect(p.droppedSubtitles).toBe(1);
  });

  it('MKV: copied, except mov_text, which becomes SubRip', () => {
    const p = planMux({
      streams: [v(0, 'vp8'), s(1, 'mov_text'), s(2, 'ass'), s(3, 'dvd_subtitle')],
    });
    expect(p.subtitles).toEqual([
      { index: 1, codec: 'subrip' },
      { index: 2, codec: 'copy' },
      { index: 3, codec: 'copy' },
    ]);
    expect(p.droppedSubtitles).toBe(0);
  });

  it('a subtitle format ffmpeg cannot identify is left out in either container', () => {
    expect(planMux({ streams: [v(0, 'h264'), s(1)] }).droppedSubtitles).toBe(1);
    expect(planMux({ streams: [v(0, 'vp8'), s(1, 'none')] }).subtitles).toEqual([]);
  });
});

describe('planMux: metadata', () => {
  it('maps Matroska target tags to MP4 names when the plain name is missing', () => {
    const probe: Probe = {
      streams: [v(0, 'vp9')],
      format: { tags: { 'MOVIE/TITLE': 'Holiday', 'MOVIE/COMMENT': 'Beach', ENCODER: 'x' } },
    };
    expect(planMux(probe).metadata).toEqual({ title: 'Holiday', comment: 'Beach' });
  });

  it('leaves tags alone when the plain name exists, and for MKV output', () => {
    expect(
      planMux({ streams: [v(0, 'h264')], format: { tags: { title: 'A', 'MOVIE/TITLE': 'B' } } })
        .metadata,
    ).toEqual({});
    expect(
      planMux({ streams: [v(0, 'vp8')], format: { tags: { 'MOVIE/TITLE': 'B' } } }).metadata,
    ).toEqual({});
  });
});

describe('muxArgs', () => {
  it('copies the video, encodes AAC at 192 kbps, maps subtitles and keeps metadata', () => {
    const plan = planMux({
      streams: [v(0, 'h264'), a(1), s(2, 'subrip')],
      format: { tags: { 'MOVIE/TITLE': 'T' } },
    });
    const args = muxArgs(plan, '/in/x.mkv', '/wav/audio.wav', '/out.mp4');
    expect(args.join(' ')).toBe(
      [
        '-hide_banner -i /in/x.mkv -i /wav/audio.wav',
        '-map 0:0 -map 1:a:0 -map 0:2',
        '-map_metadata 0 -map_chapters 0 -metadata title=T -map_metadata:s:a:0 0:s:a:0',
        '-c:v copy -c:a aac -b:a 192k -disposition:a:0 default',
        '-c:s:0 mov_text -f mp4 /out.mp4',
      ].join(' '),
    );
  });

  it('writes Matroska, and skips the audio tag copy when the input had no audio', () => {
    const args = muxArgs(planMux({ streams: [v(0, 'vp8')] }), '/in/a', '/wav/b', '/out.mkv');
    expect(args).not.toContain('-map_metadata:s:a:0');
    expect(args.slice(-3)).toEqual(['-f', 'matroska', '/out.mkv']);
  });
});

describe('names and parsing', () => {
  it('names the output "<original name> (Clearly).mp4" or ".mkv"', () => {
    expect(videoOutputName('holiday clip.MOV', 'mp4')).toBe('holiday clip (Clearly).mp4');
    expect(videoOutputName('talk.webm', 'mkv')).toBe('talk (Clearly).mkv');
    expect(videoOutputName('noext', 'mp4')).toBe('noext (Clearly).mp4');
  });

  it('parses ffprobe JSON and rejects output without it', () => {
    const p = parseProbe(
      '{\n "streams": [{"index": 0, "codec_type": "video"}],\n "format": {}\n}\n',
    );
    expect(p.streams).toHaveLength(1);
    expect(() => parseProbe('error')).toThrow();
  });
});
