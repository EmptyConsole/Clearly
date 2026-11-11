// @clearly/audio: standard Web Audio graph construction shared by live playback and offline export.
// Depends on @clearly/core. No React, no DOM beyond Web Audio, Workers and Blob.

export * from './constants.ts';
export {
  buildProcessingGraph,
  getLatencyBudget,
  latencyBudget,
  type GraphEvents,
  type GraphIo,
  type GraphTaps,
  type LatencyBudget,
  type LevelReading,
  type ProcessingGraph,
  type ReductionReadings,
} from './graph/buildProcessingGraph.ts';
export {
  planFilters,
  simulateCutsDb,
  type EarPlan,
  type FilterPlan,
  type GraphSettings,
  type HumNotch,
  type HumSettings,
  type ProcessingMode,
} from './graph/params.ts';
export type { CompressorStage } from './graph/compressorStage.ts';
export type { NodeRole, Topology, TopologyEdge, TopologyNode } from './graph/wiring.ts';
export { ensureWorklets, createCaptureNode } from './graph/worklets.ts';
export { measureCompressorLatency } from './graph/latency.ts';
export type { PerfReport } from './worklets/protocol.ts';
export {
  createToneGenerator,
  clampTonePeakDbfs,
  type CalibrationRamp,
  type Ear,
  type ScheduledTone,
  type ToneGenerator,
  type WarbleOptions,
} from './tone/toneGenerator.ts';
export {
  renderOffline,
  type RenderOptions,
  type RenderProgress,
  type RenderResult,
} from './render/renderOffline.ts';
export {
  AudioBufferReader,
  SampleRateError,
  type ChunkedSourceReader,
  type EncoderSink,
  type StereoBlock,
} from './render/source.ts';
export {
  createMp3Sink,
  createWavSink,
  EncoderError,
  type Mp3SinkOptions,
  type WavSinkOptions,
} from './encoders/sinks.ts';
export { OPFS_TEMP_DIR } from './encoders/opfsWriter.ts';
export { WavLimitError } from './dsp/wav.ts';
export { StreamResampler, type ResamplerOptions } from './dsp/resampler.ts';
export {
  detectDiscontinuities,
  type Discontinuity,
  type DetectorOptions,
} from './dsp/discontinuity.ts';
export { syntheticSpeech, type SyntheticSpeechOptions } from './demo/syntheticSpeech.ts';
export {
  openFileReader,
  FileReadError,
  DECODE_BUDGET_BYTES,
  type OpenedFile,
  type OpenFileOptions,
} from './render/fileReader.ts';
export { prepareDigit, rmsDbfsOf, DIGIT_RMS_DBFS } from './dsp/digits.ts';
export { createSafetyLimiter } from './graph/safety.ts';
export {
  HumTracker,
  SpectrumAverager,
  estimateHum,
  humNotches,
  lockedHumNotches,
  fixedHumNotches,
  blackmanSpectrumDb,
  HUM_FFT_SIZE,
  HUM_INTERVAL_MS,
  type HumEstimate,
  type HumState,
} from './dsp/humDetect.ts';
export {
  CalmGenerator,
  CALM_KINDS,
  CALM_RMS_DBFS,
  calmCapDbfs,
  calmGain,
  pitchStep,
  PITCH_START_HZ,
  SLEEP_FADE_S,
  type CalmKind,
} from './dsp/calm.ts';
export { createCalmGraph, type CalmGraph, type CalmGraphOptions } from './graph/calmGraph.ts';
export { HUM_RELEASE_S } from './dsp/humDetect.ts';
