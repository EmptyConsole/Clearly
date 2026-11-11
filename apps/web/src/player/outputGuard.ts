// Output-device guard (M14 fault handling). When headphones are unplugged mid-playback, browsers
// move the sound to the next output, usually the speakers, at the same level. Clearly pauses
// instead and says why. Without device permission, browsers hide device ids, so a change cannot
// be told apart from a removal; then any change while playing pauses (one tap carries on).

export interface OutputSnapshot {
  readonly ids: readonly string[];
}

export async function snapshotOutputs(
  // navigator.mediaDevices is missing on insecure origins (a phone on http://192.168.x.x).
  md: MediaDevices | undefined = 'mediaDevices' in navigator ? navigator.mediaDevices : undefined,
): Promise<OutputSnapshot> {
  if (!md) return { ids: [] };
  try {
    const all = await md.enumerateDevices();
    return { ids: all.filter((d) => d.kind === 'audiooutput').map((d) => d.deviceId) };
  } catch {
    return { ids: [] };
  }
}

/** True when the change may have taken away the device sound was playing on. */
export function outputMayBeLost(before: OutputSnapshot, after: OutputSnapshot): boolean {
  const known = (s: OutputSnapshot) => s.ids.length > 0 && s.ids.every((id) => id !== '');
  if (!known(before) || !known(after)) return true;
  return before.ids.some((id) => !after.ids.includes(id));
}

/**
 * Calls onLost when an output may have been removed while `active`. Returns a stop function.
 * The snapshot is refreshed after every change, so plugging headphones back in is remembered.
 */
export function watchOutputs(isActive: () => boolean, onLost: () => void): () => void {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (!md || typeof md.addEventListener !== 'function') return () => undefined;
  let snapshot: OutputSnapshot = { ids: [] };
  let live = true;
  void snapshotOutputs(md).then((s) => {
    snapshot = s;
  });
  const onChange = () => {
    void snapshotOutputs(md).then((next) => {
      if (!live) return;
      const lost = outputMayBeLost(snapshot, next);
      snapshot = next;
      if (lost && isActive()) onLost();
    });
  };
  md.addEventListener('devicechange', onChange);
  return () => {
    live = false;
    md.removeEventListener('devicechange', onChange);
  };
}
