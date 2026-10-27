import { MIN_TRACKING_BPM } from '../dsp.js';

/** Live display policy only; does not change DSP estimates or final rhythm rules. */
export const CAMERA_SIGNAL_WARMUP_SEC = 3;
export const LIVE_SIGNAL_MIN_SEC = 5;
export const LIVE_ANALYSIS_START_SEC = CAMERA_SIGNAL_WARMUP_SEC + LIVE_SIGNAL_MIN_SEC;
export const LIVE_ANALYSIS_INTERVAL_SEC = 2;

export function shouldAnalyzeLive(elapsedSec, lastTickSec, sampleCount, fs) {
  return elapsedSec >= LIVE_ANALYSIS_START_SEC
    && Math.floor(elapsedSec) - lastTickSec >= LIVE_ANALYSIS_INTERVAL_SEC
    && sampleCount >= Math.ceil(LIVE_SIGNAL_MIN_SEC * fs);
}

export function canDisplayLiveBpm(result) {
  return Number.isFinite(result?.bpm) && result.bpm >= MIN_TRACKING_BPM
    && result.qualityScore >= 50
    && result.estimator?.agreement >= 2
    && result.estimator.source !== 'prior'
    && !['prior-fallback', 'hold'].includes(result.filterState?.mode);
}
