// Every number packages/audio uses, with its source. Numbers that core already owns (band
// frequencies, filter Qs, compressor defaults, limit ranges) are imported from @clearly/core, not
// repeated here. RULES.md is the specification; see docs/PLAN.txt for the chain and latency budget.

/** The rate AudioEngine requests and the offline renderer uses (RULES.md). */
export const ENGINE_SAMPLE_RATE_HZ = 48000;

// ---------------------------------------------------------------------------------------------
// Parameter smoothing (RULES.md: every change uses setTargetAtTime)

/** Time constant for Original | Enhanced and other crossfades. */
export const CROSSFADE_TAU_S = 0.03;
/** Time constant for slider-driven parameters (EQ gains, filter frequencies, ceilings). */
export const SLIDER_TAU_S = 0.05;

// ---------------------------------------------------------------------------------------------
// Background cleanup slot (M02 builds the slot; M06 swaps in the RNNoise worklet)
//
// Derivation of CLEANUP_LATENCY_SAMPLES (all at 48 kHz, which RNNoise requires):
//  1. RNNoise works on frames of 480 samples (10 ms).
//  2. RNNoise's synthesis is a 50 percent overlap-add of 960-sample windows: each call outputs the
//     overlap of the previous and current windows, so its output lags its input by one frame,
//     480 samples. ASSUMPTION to verify in M06 with an impulse through the real module; if it
//     differs, M06 changes RNNOISE_ALGORITHMIC_DELAY_SAMPLES and everything else follows.
//  3. Ring buffer (M06 design): input samples are queued until a full 480-sample frame exists; the
//     frame is processed inside the same process() call and its output appended to an output FIFO
//     that was primed with P zeros. Every process() call reads one render quantum (Q samples) from
//     that FIFO. The last sample of a frame arrives in the quantum that completes the frame, and the
//     frame's first sample must leave the FIFO no earlier than that quantum. Writing r for the
//     frame's offset inside its first quantum, the condition is
//         floor((r + P) / Q) >= floor((r + 479) / Q)  for every reachable r,
//     which holds for every quantum size Q whenever P >= 479. We prime with P = 480 (one frame), so
//     the design does not depend on the render quantum size (Web Audio 1.1 lets it vary).
//  Total: 480 (algorithm) + 480 (ring buffer) = 960 samples = 20 ms.
// When cleanup is bypassed or not downloaded, a DelayNode of exactly this length sits in its place
// (RULES.md constant-latency design).

export const RNNOISE_FRAME_SAMPLES = 480;
export const RNNOISE_ALGORITHMIC_DELAY_SAMPLES = RNNOISE_FRAME_SAMPLES;
export const CLEANUP_RING_PRIME_SAMPLES = RNNOISE_FRAME_SAMPLES;
export const CLEANUP_LATENCY_SAMPLES =
  RNNOISE_ALGORITHMIC_DELAY_SAMPLES + CLEANUP_RING_PRIME_SAMPLES;

// ---------------------------------------------------------------------------------------------
// Lookahead limiter (RULES.md: AudioWorklet, stereo-linked, inter-sample-peak aware)

export const LIMITER_LOOKAHEAD_MS_DEFAULT = 2;
export const LIMITER_RELEASE_MS = 100;
/** Smoothing of ceiling changes inside the limiter, matching the slider time constant. */
export const LIMITER_CEILING_TAU_MS = SLIDER_TAU_S * 1000;
/** Peak detection runs at 4x the sample rate (polyphase FIR interpolation). */
export const OVERSAMPLE_FACTOR = 4;
/**
 * Taps per polyphase branch. 16 taps (64-tap prototype) with a Kaiser window, beta 8, keep the
 * interpolation error far below the 0.1 dB tolerance across 20 Hz to 20 kHz at 48 kHz. The
 * detector delay is TAPS_PER_PHASE / 2 samples and is absorbed inside the lookahead.
 */
export const OVERSAMPLE_TAPS_PER_PHASE = 16;
export const OVERSAMPLE_KAISER_BETA = 8;
/** Safety limiter: fixed ceiling, last processing node on every path (RULES.md). */
export const SAFETY_CEILING_DBFS = -3;
/** How often limiters and meters post readings to the main thread (audio time). */
export const METER_REPORT_INTERVAL_MS = 50;

// ---------------------------------------------------------------------------------------------
// Fixed gain stages and the program limiter (RULES.md signal chain)

export const PRE_ATTENUATION_DB = -3;
export const PROGRAM_LIMITER = {
  thresholdDbfs: -3,
  kneeDb: 0,
  ratio: 20,
  attackMs: 3,
  releaseMs: 100,
} as const;
/**
 * Compression "off" (Simulate my hearing): ratio 1 at threshold 0 dBFS. The node stays in place so
 * the wet latency is unchanged; with ratio 1 the Web Audio makeup gain is 0 dB as well.
 */
export const COMPRESSOR_OFF = {
  thresholdDbfs: 0,
  kneeDb: 0,
  ratio: 1,
  attackMs: 10,
  releaseMs: 250,
} as const;

// ---------------------------------------------------------------------------------------------
// Voice focus (M02 section 1). Core's clamp is told the actual mid boost (see params.ts).

export const VOICE_FOCUS_MID_MAX_DB = 4;
export const VOICE_FOCUS_SIDE_MIN_DB = -6;

// ---------------------------------------------------------------------------------------------
// Hum filter slot (M02 builds the bank; M09 adds detection)

/**
 * Hum Filter notch stages (M09): two stagger-tuned notches for the fundamental and each of up to
 * five harmonics. A single Q-30 notch only removes 25 dB within about +-0.04 Hz of the hum, which
 * is tighter than an 8192-point spectrum can estimate; a pair a little either side keeps more than
 * 40 dB across +-0.1 Hz of error (DECISIONS M09). Notches add no latency.
 */
export const HUM_MAX_NOTCHES = 12;
export const HUM_NOTCH_DEFAULT_Q = 30;

// ---------------------------------------------------------------------------------------------
// Simulate my hearing

/** Total attenuation at any frequency is capped at 40 dB. */
export const SIMULATE_MAX_CUT_DB = 40;
/** Each filter cuts at most 24 dB. */
export const SIMULATE_FILTER_MIN_DB = -24;

// ---------------------------------------------------------------------------------------------
// Mono detection (M02 section 1)

export const MONO_THRESHOLD_DB = -60;
export const MONO_HOLD_S = 2;
/** Analysis window. Silence (below MONO_SILENCE_DBFS) neither confirms nor breaks mono. */
export const MONO_WINDOW_MS = 100;
export const MONO_SILENCE_DBFS = -80;

// ---------------------------------------------------------------------------------------------
// Overload guard (RULES.md defence in depth)

export const OVERLOAD_THRESHOLD_DBFS = -1;
export const OVERLOAD_HOLD_MS = 200;
export const OVERLOAD_FADE_MS = 100;
/**
 * Gaps between over-threshold samples shorter than this keep a run going. A 20 Hz waveform peaks
 * every 25 ms (twice per cycle), so any sustained overload at audible frequencies stays one run.
 */
export const OVERLOAD_GAP_MS = 25;

// ---------------------------------------------------------------------------------------------
// Loudness meter (ITU-R BS.1770 K-weighting, momentary 400 ms window)

export const LOUDNESS_MOMENTARY_MS = 400;
export const LOUDNESS_BLOCK_MS = 100;

// ---------------------------------------------------------------------------------------------
// Tone generator (M02 section 2). Duration, FM rate and depth, ramp time, the peak clamp and the
// calibration stop level (CALIBRATION_MAX_DBFS) come from core.

export const CALIBRATION_FREQ_HZ = 1000;
export const CALIBRATION_START_DBFS = -60;
export const CALIBRATION_STEP_DB = 1.5;
export const CALIBRATION_STEP_MS = 100;
/** Each calibration step changes level with a short linear ramp so the steps do not click. */
export const CALIBRATION_STEP_RAMP_MS = 5;
/** Points in each raised-cosine ramp curve (setValueCurveAtTime interpolates linearly between). */
export const RAMP_CURVE_POINTS = 256;
/** Tones start this far after currentTime so scheduling never lands in the past. */
export const TONE_SCHEDULE_LEAD_S = 0.05;

// ---------------------------------------------------------------------------------------------
// Offline renderer (M02 section 3)

export const RENDER_SEGMENT_S_DEFAULT = 120;
export const RENDER_PREROLL_S_DEFAULT = 5;
export const RENDER_CROSSFADE_MS = 10;
/** Size of the blocks handed to the encoder sink. */
export const RENDER_SINK_BLOCK_FRAMES = 48000;
/** How often (audio time) a segment render pauses to report progress and check for cancel. */
export const RENDER_PROGRESS_INTERVAL_S = 10;

// ---------------------------------------------------------------------------------------------
// Encoders (M02 section 4)

/** RIFF sizes are 32-bit: the RIFF chunk size (36 + data bytes) must fit in 0xFFFFFFFF. */
export const WAV_HEADER_BYTES = 44;
export const WAV_MAX_DATA_BYTES = 0xffffffff - 36;
export const MP3_BITRATES_KBPS = [128, 192, 256, 320] as const;
export type Mp3BitrateKbps = (typeof MP3_BITRATES_KBPS)[number];
export const MP3_BITRATE_DEFAULT_KBPS: Mp3BitrateKbps = 192;

// ---------------------------------------------------------------------------------------------
// Discontinuity detector (M02 section 5)

/** Robust-scale window (centred) and the block size the scale is recomputed at. */
export const CLICK_SCALE_WINDOW = 2048;
export const CLICK_SCALE_BLOCK = 256;
/**
 * A sample is a click when its second difference is this many robust SDs from the median. Chosen
 * from measurements (2026-11-09): clean programme renders through every preset peak at 3.7; a
 * -20 dBFS click on processed programme scores 11. 6 leaves a 1.6x margin above clean audio.
 */
export const CLICK_THRESHOLD_SIGMAS = 6;
/** Second differences below this absolute size are never clicks (about -80 dBFS). */
export const CLICK_ABSOLUTE_FLOOR = 1e-4;
/** Flags closer than this are one event. */
export const CLICK_MERGE_MS = 5;
/** 1 / Phi^-1(0.75): converts a median absolute deviation to a standard-deviation estimate. */
export const MAD_TO_SD = 1.4826;

// ---------------------------------------------------------------------------------------------
// Night mode (M06). Rider targets and limits come from the M06 prompt; the compressor that follows
// it is chosen here (DECISIONS M06): its threshold sits 6 dB under the level's target so it only
// catches peaks the slow rider lets through, with a softer knee and longer release at Light
// (natural) and a harder knee, faster attack and shorter release at Strong (more even).

export interface NightLevelParams {
  readonly rider: {
    readonly targetLufs: number;
    readonly maxBoostDb: number;
    readonly maxCutDb: number;
  };
  readonly compressor: {
    readonly thresholdDbfs: number;
    readonly kneeDb: number;
    readonly ratio: number;
    readonly attackMs: number;
    readonly releaseMs: number;
  };
}

/** Keys match core's NIGHT_MODE_LEVELS: low = Light, medium = Medium, high = Strong. */
export const NIGHT_LEVELS: Readonly<Record<'low' | 'medium' | 'high', NightLevelParams>> = {
  low: {
    rider: { targetLufs: -24, maxBoostDb: 6, maxCutDb: 12 },
    compressor: { thresholdDbfs: -30, kneeDb: 10, ratio: 3, attackMs: 10, releaseMs: 250 },
  },
  medium: {
    rider: { targetLufs: -26, maxBoostDb: 9, maxCutDb: 12 },
    compressor: { thresholdDbfs: -32, kneeDb: 8, ratio: 5, attackMs: 6, releaseMs: 200 },
  },
  high: {
    rider: { targetLufs: -28, maxBoostDb: 12, maxCutDb: 15 },
    compressor: { thresholdDbfs: -34, kneeDb: 6, ratio: 8, attackMs: 3, releaseMs: 150 },
  },
};
