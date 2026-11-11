// Browser-tab capture with getDisplayMedia. Options checked against the Screen Capture spec and
// Chromium's documentation (DECISIONS M05): suppressLocalAudioPlayback (audio constraint),
// selfBrowserSurface "exclude", surfaceSwitching "include" (lets the person switch tabs from
// Chrome's sharing bar), systemAudio "exclude" (tab audio only), preferCurrentTab false. Browsers
// ignore options they do not know.

export class NoAudioSharedError extends Error {
  override readonly name = 'NoAudioSharedError';
}

export interface TabCapture {
  readonly stream: MediaStream;
  readonly audioTrack: MediaStreamTrack;
  /** The tab's title, when the browser gives one (from the video track's label). */
  readonly title: string | null;
  /** False when the browser did not apply suppressLocalAudioPlayback: doubled sound is likely. */
  readonly suppressed: boolean;
  /** Desktop app (M12): system sound or a virtual cable instead of a browser tab. */
  readonly via?: 'system' | 'cable';
}

export const DISPLAY_MEDIA_OPTIONS = {
  video: true,
  audio: {
    suppressLocalAudioPlayback: true,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
  systemAudio: 'exclude',
  preferCurrentTab: false,
} as const;

/** Thrown NotAllowedError (the person cancelled) is passed through for the caller to ignore. */
export async function startTabCapture(
  md: MediaDevices = navigator.mediaDevices,
): Promise<TabCapture> {
  const stream = await md.getDisplayMedia(DISPLAY_MEDIA_OPTIONS);
  const video = stream.getVideoTracks()[0];
  const title = video?.label ? video.label : null;
  // The picture is not needed: stop it straight away.
  for (const v of stream.getVideoTracks()) {
    v.stop();
    stream.removeTrack(v);
  }
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) {
    for (const t of stream.getTracks()) t.stop();
    throw new NoAudioSharedError('no audio track');
  }
  const settings = audioTrack.getSettings() as MediaTrackSettings & {
    suppressLocalAudioPlayback?: boolean;
  };
  return { stream, audioTrack, title, suppressed: settings.suppressLocalAudioPlayback === true };
}

export const isCancel = (e: unknown): boolean =>
  e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError');
