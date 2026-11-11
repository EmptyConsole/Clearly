// The demo clip: until a licensed TTS recording exists (owner question), Clearly's own 60-second
// speech-like sound (packages/audio syntheticSpeech, CC0), rendered once to a WAV object URL so it
// plays through a media element with the normal transport.

export const DEMO_SECONDS = 60;
let url: string | null = null;
let humUrl: string | null = null;
/** The Hum Filter demo: 60 Hz mains hum with five harmonics, fundamental at -30 dBFS peak. */
export const DEMO_HUM_HZ = 60;

function wavFromStereo(l: Float32Array, r: Float32Array, rate: number): Blob {
  const n = l.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const s = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
    v.setInt16(44 + i * 4, s(l[i] ?? 0), true);
    v.setInt16(46 + i * 4, s(r[i] ?? 0), true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function demoClipUrl(hum = false): Promise<string> {
  if (!hum && url) return url;
  if (hum && humUrl) return humUrl;
  const { syntheticSpeech } = await import('@clearly/audio');
  const rate = 48000;
  const [l, r] = syntheticSpeech({ sampleRate: rate, seconds: DEMO_SECONDS });
  if (hum) {
    const a = 10 ** (-30 / 20);
    for (let i = 0; i < l.length; i++) {
      let v = 0;
      for (let k = 1; k <= 6; k++)
        v += (a / k) * Math.sin((2 * Math.PI * k * DEMO_HUM_HZ * i) / rate);
      l[i] = (l[i] ?? 0) + v;
      r[i] = (r[i] ?? 0) + v;
    }
    humUrl = URL.createObjectURL(wavFromStereo(l, r, rate));
    return humUrl;
  }
  url = URL.createObjectURL(wavFromStereo(l, r, rate));
  return url;
}
