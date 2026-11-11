// Every number used by the hearing maths, with its source or the reason for it.
// docs/HEARING_MATH.txt explains each one in prose. Tuned values carry "TUNED" and the stage
// of the tuning ladder (M01 section 6) that fixed them; docs/DECISIONS.txt records the outcome.

/** The eight personal-EQ and audiogram bands in Hz (RULES.md signal chain, M01 section 1). */
export const BAND_FREQUENCIES_HZ = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000] as const;
export type BandHz = (typeof BAND_FREQUENCIES_HZ)[number];
export const BAND_COUNT = BAND_FREQUENCIES_HZ.length;

/** Express measures these (M01 section 3): five octave-spaced bands that cover speech. */
export const EXPRESS_FREQUENCIES_HZ = [500, 1000, 2000, 4000, 8000] as const;
/** Refine adds these to reach all eight bands (M01 section 3). */
export const REFINE_EXTRA_FREQUENCIES_HZ = [250, 3000, 6000] as const;

/** The reference band: loss is measured relative to the better ear here (M01 section 4). */
export const REFERENCE_FREQUENCY_HZ = 1000;

// ---------------------------------------------------------------------------------------------
// Levels and grid (M01 section 3)

/** Calibration stops at -12 dBFS, so Lc is never louder than this. */
export const CALIBRATION_MAX_DBFS = -12;
/** Quietest calibration level we accept: 80 dB below full scale is far below any real result. */
export const CALIBRATION_MIN_DBFS = -80;
/** Ceiling = min(Lc + 12, -6): at most 12 dB above the comfortable calibration level... */
export const CEILING_ABOVE_LC_DB = 12;
/** ...and never above -6 dBFS, the loudest tone peak the timing model allows (section 7). */
export const CEILING_MAX_DBFS = -6;
/** Quietest presentable level. Below this, 16-bit-class DACs and room noise dominate. */
export const PRESENT_FLOOR_DBFS = -90;
/** The grid starts 70 dB below Lc (deeper than any plausible threshold)... */
export const GRID_BELOW_LC_DB = 70;
/** ...but never below -100 dBFS, 10 dB under the presentation floor, for the "heard at floor" mass. */
export const GRID_MIN_DBFS = -100;
/** The grid runs 10 dB above the ceiling to hold "no response at the maximum safe level" mass. */
export const GRID_ABOVE_CEILING_DB = 10;
/** 1 dB grid steps (M01 section 3). Finer than any meaningful threshold difference. */
export const GRID_STEP_DB = 1;
/**
 * A floor or ceiling flag is raised when at least this share of the posterior lies beyond it.
 * Chosen as "more likely than not"; the UI shows the flag, never a number past the limit.
 */
export const EDGE_FLAG_MASS = 0.5;

// ---------------------------------------------------------------------------------------------
// Prior (M01 section 3)

/**
 * Normal threshold sits about 45 dB below the calibration level Lc. Lc is set by the person as a
 * comfortable listening level; comfortable speech-level listening is about 40 to 50 dB above
 * threshold for normal hearing, so 45 dB is the midpoint.
 */
export const PRIOR_THRESHOLD_BELOW_LC_DB = 45;
/** Age range assumed when the person skips the question: the middle of the target users. */
export const DEFAULT_AGE_RANGE = '50-59';

// ---------------------------------------------------------------------------------------------
// Psychometric function used by the estimator (M01 section 3)

/** Initial guess rate: 2% of silent or inaudible trials get a "heard" tap. */
export const GUESS_RATE_INITIAL = 0.02;
/** Lapse rate: 4% of clearly audible tones are missed (blinks, distraction). */
export const LAPSE_RATE = 0.04;
/** Psychometric slope sigma in dB. Slightly wider than the simulated truth (2 dB) to be robust. */
export const PSYCHOMETRIC_SIGMA_DB = 3;

/** Beta(1, 49) prior on the guess rate: mean 0.02, worth 50 pseudo-trials, so one slip moves it little. */
export const GUESS_PRIOR_ALPHA = 1;
export const GUESS_PRIOR_BETA = 49;
/** Posterior-mean guess rate is clamped to this range so a run of slips cannot break the model. */
export const GUESS_RATE_MIN = 0.01;
export const GUESS_RATE_MAX = 0.15;
/** The guess rate is re-estimated only once this many catch trials exist. */
export const GUESS_UPDATE_MIN_CATCH = 3;

// ---------------------------------------------------------------------------------------------
// Catch trials (M01 section 3)

/** One catch trial per this many real trials. */
export const CATCH_EVERY_REAL_TRIALS = 5;
export const CATCH_MIN_EXPRESS = 6;
export const CATCH_MIN_REFINE = 8;

// ---------------------------------------------------------------------------------------------
// Placement jitter (M01 section 3)

/** Next level = posterior median + uniform jitter in +/- this many dB. TUNED (stage 1). */
export const LEVEL_JITTER_DB = 2;
/** Presented levels are rounded to this step (M01 section 3). */
export const LEVEL_ROUND_DB = 0.5;

// ---------------------------------------------------------------------------------------------
// Loss (M01 section 4)

/** Bands with at most this loss get no boost at all (bottom of the soft knee). */
export const GAIN_KNEE_START_DB = 2;
/** Bands with at least this loss get the full ratio (top of the soft knee). */
export const GAIN_KNEE_END_DB = 8;

// ---------------------------------------------------------------------------------------------
// Reliability (M01 section 4)

export const RELIABILITY_HIGH_FA_MIN = 1;
export const RELIABILITY_HIGH_FA_SHARE = 0.15;
export const RELIABILITY_HIGH_MAX_SD_DB = 6;
export const RELIABILITY_MEDIUM_FA_MIN = 2;
export const RELIABILITY_MEDIUM_FA_SHARE = 0.3;
export const RELIABILITY_MEDIUM_WIDE_SD_DB = 8;
export const RELIABILITY_MEDIUM_MAX_WIDE_TRACKS = 2;

// ---------------------------------------------------------------------------------------------
// Referral flags (M01 section 4). Not a diagnosis: these only suggest a professional check.

export const REFERRAL_AVERAGE_ASYMMETRY_DB = 20;
export const REFERRAL_BAND_ASYMMETRY_DB = 30;
export const REFERRAL_AVERAGE_LOSS_DB = 40;

// ---------------------------------------------------------------------------------------------
// Gain (M01 section 5)

export const BOOST_RATIO = { gentle: 0.33, standard: 0.5, strong: 0.6 } as const;
export const DEFAULT_BOOST_STYLE = 'standard';
export const CAP_DEFAULT_DB = 18;
export const CAP_MIN_DB = 12;
export const CAP_MAX_DB = 24;
/** Starter profiles are guesses from age alone, so they are held to Gentle with a 12 dB cap. */
export const STARTER_BOOST_STYLE = 'gentle';
export const STARTER_CAP_DB = 12;
export const STRENGTH_MIN = 0;
export const STRENGTH_MAX = 1.5;
export const STRENGTH_DEFAULT = 1;
/** Hard limit on any band's boost from any source (RULES.md safety rules). */
export const MAX_BAND_BOOST_DB = 24;

// ---------------------------------------------------------------------------------------------
// Filters (RULES.md signal chain). Sample rate 48 kHz is what AudioEngine requests.

export const SAMPLE_RATE_HZ = 48000;
/** Personal EQ: peaking Q 1.0 at the first seven bands, highshelf at 8000 Hz (Web Audio S = 1). */
export const EQ_PEAKING_Q = 1.0;
export const SPEECH_PEAK_HZ = 2500;
export const SPEECH_PEAK_Q = 1.0;
export const SPEECH_PEAK_DB = 3;
export const AMBIENT_PEAK_HZ = 2500;
export const AMBIENT_PEAK_Q = 0.8;
/** Ambient boost range in dB. Chosen small: it lifts quiet surroundings, it is not a second EQ. */
export const AMBIENT_BOOST_MAX_DB = 6;
/**
 * Voice focus adds a mid-channel peaking boost near 2000 Hz. Its full strength is 6 dB at Q 0.7.
 * M01 fixes these as the clamp's model of Voice focus; the audio milestone must build the same
 * filter (it imports these constants), so the clamp and the graph cannot disagree.
 */
export const VOICE_FOCUS_PEAK_HZ = 2000;
export const VOICE_FOCUS_PEAK_Q = 0.7;
export const VOICE_FOCUS_MAX_DB = 6;
/** Dense log-frequency grid for the summed-boost estimate: 20 Hz to 20 kHz, 48 points per octave. */
export const CLAMP_GRID_MIN_HZ = 20;
export const CLAMP_GRID_MAX_HZ = 20000;
export const CLAMP_GRID_POINTS_PER_OCTAVE = 48;
/** Bisection iterations when scaling: 2^-40 is far below any audible difference. */
export const CLAMP_BISECTION_STEPS = 40;

// ---------------------------------------------------------------------------------------------
// Compressor (RULES.md signal chain)

export const COMPRESSOR_DEFAULT = {
  thresholdDbfs: -24,
  kneeDb: 12,
  ratio: 4,
  attackMs: 10,
  releaseMs: 250,
} as const;

// ---------------------------------------------------------------------------------------------
// Loudest-sound limit (RULES.md)

export const LOUDEST_LIMIT_MIN_DBFS = -24;
export const LOUDEST_LIMIT_MAX_DBFS = -6;
export const LOUDEST_LIMIT_DEFAULT_DBFS = -12;

// ---------------------------------------------------------------------------------------------
// Trial timing (M01 section 7)

export const CUE_LEAD_MS = 200;
export const TONE_DURATION_MS = 350;
export const TONE_FM_RATE_HZ = 5;
export const TONE_FM_DEPTH = 0.05;
export const TONE_RAMP_MS = 20;
export const TONE_PEAK_MIN_DBFS = PRESENT_FLOOR_DBFS;
export const TONE_PEAK_MAX_DBFS = CEILING_MAX_DBFS;
export const RESPONSE_WINDOW_MS = 1000;
export const AFTER_HEARD_MS = 300;
export const GAP_MIN_MS = 250;
export const GAP_MAX_MS = 450;
export const SLOWER_PACE_FACTOR = 1.5;
/**
 * Mean time from tone onset to a "heard" tap, used only for duration estimates. Simple reaction
 * times to near-threshold tones in adults over 50 are typically 400 to 500 ms; we take 450 ms.
 * ASSUMPTION: replace with the median measured in real sessions once the UI exists.
 */
export const MEAN_REACTION_MS = 450;
export const CALIBRATION_SECONDS = 4;
export const STARTER_SECONDS = 5;
export const DURATION_ROUND_TO_S = 10;

// ---------------------------------------------------------------------------------------------
// Hearing Check screens (M03)

/** A calibration tap this soon after the ramp starts is treated as a reflex, and repeated. */
export const CALIBRATION_TOO_FAST_MS = 400;
