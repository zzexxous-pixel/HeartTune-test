import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAnalyzeLive, canDisplayLiveBpm, CAMERA_SIGNAL_WARMUP_SEC, LIVE_ANALYSIS_START_SEC } from '../src/features/measurement-policy.js';
import { analyzePpgSignal, generateSyntheticPPG, TARGET_FS } from '../src/dsp.js';

const good = { bpm: 72, qualityScore: 70, estimator: { source: 'consensus', agreement: 3 }, filterState: { mode: 'tracking' } };

test('live analysis starts at 8 seconds with 5 seconds of resampled signal, then every 2 seconds', () => {
  assert.equal(CAMERA_SIGNAL_WARMUP_SEC, 3);
  assert.equal(LIVE_ANALYSIS_START_SEC, 8);
  assert.equal(shouldAnalyzeLive(7.99, 0, 120, 15), false);
  assert.equal(shouldAnalyzeLive(8, 0, 74, 15), false);
  assert.equal(shouldAnalyzeLive(8.1, 0, 75, 15), true);
  assert.equal(shouldAnalyzeLive(9.99, 8, 100, 15), false);
  assert.equal(shouldAnalyzeLive(10, 8, 105, 15), true);
});

test('live display requires sufficient quality and agreement, not merely a positive BPM', () => {
  assert.equal(canDisplayLiveBpm(good), true);
  for (const result of [undefined, { ...good, bpm: NaN }, { ...good, bpm: 0 }, { ...good, qualityScore: 49 }, { ...good, estimator: { source: 'frequency', agreement: 0 } }]) {
    assert.equal(canDisplayLiveBpm(result), false);
  }
});

test('prior fallback and hold estimates are not presented as new live measurements', () => {
  assert.equal(canDisplayLiveBpm({ ...good, estimator: { source: 'prior', agreement: 2 } }), false);
  for (const mode of ['prior-fallback', 'hold']) {
    assert.equal(canDisplayLiveBpm({ ...good, filterState: { mode } }), false);
  }
});

test('normal synthetic signal can pass the live gate after 5 seconds; silence cannot', () => {
  for (const durationSec of [5, 8]) {
    const result = analyzePpgSignal(generateSyntheticPPG({ bpm: 72, durationSec, seed: 42 }), TARGET_FS);
    assert.equal(canDisplayLiveBpm(result), true);
    assert.ok(Math.abs(result.bpm - 72) <= 4);
  }
  assert.equal(canDisplayLiveBpm(analyzePpgSignal(new Float64Array(75), TARGET_FS)), false);
});
