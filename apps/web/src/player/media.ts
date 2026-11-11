// Media element changes live here, outside components, so render code never mutates props.

export const SKIP_SECONDS = 10;

export function seekBy(media: HTMLMediaElement, seconds: number): void {
  const d = Number.isFinite(media.duration) ? media.duration : Number.POSITIVE_INFINITY;
  media.currentTime = Math.max(0, Math.min(d, media.currentTime + seconds));
}
export function seekTo(media: HTMLMediaElement, seconds: number): void {
  media.currentTime = seconds;
}
export function setVolume(media: HTMLMediaElement, v: number): void {
  media.volume = v;
}
export function setSpeed(media: HTMLMediaElement, v: number): void {
  media.preservesPitch = true;
  media.playbackRate = v;
}
export function togglePlay(media: HTMLMediaElement): void {
  if (media.paused) void media.play();
  else media.pause();
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
