import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_FS, MIN_TRACKING_BPM, MAX_TRACKING_BPM, DEFAULT_HP_HZ,
  estimateBpmAutocorr, bandpassFilter, analyzePpgSignal, generateSyntheticPPG, resolveBpmEstimate
} from '../src/dsp.js';
import { canDisplayLiveBpm } from '../src/features/measurement-policy.js';
import { loadCalibrationBaseline, saveCalibrationSample, CALIB_STORAGE_KEY } from '../src/features/storage.js';

// Baseline c86b324 failures; track remaining limitations rather than calling all noise results accurate.
const legacyNoisyFailures = new Set([
  '40/12/2', '40/12/3', '40/27/1', '40/27/2', '40/27/42', '40/57/3',
  '42/12/1', '42/57/1', '44/12/42', '44/27/42', '45/12/3', '45/12/42'
]);

test('40 BPM boundary is included in autocorrelation and harmonic arbitration', () => {
  assert.equal(MIN_TRACKING_BPM, 40);
  assert.equal(MAX_TRACKING_BPM, 195);
  const sine = Float64Array.from({ length: 27 * TARGET_FS }, (_, i) => Math.sin(2 * Math.PI * (40 / 60) * i / TARGET_FS));
  assert.ok(Math.abs(estimateBpmAutocorr(bandpassFilter(sine), TARGET_FS) - 40) < 1);
  const result = resolveBpmEstimate({ fftBpm: 80, autocorrBpm: 39.9, beatMedianBpm: 40.1, beatCount: 5, durationSec: 7, priorBpm: 72 });
  assert.equal(result.source, 'early-time-domain');
  assert.ok(Math.abs(result.bpm - 40) < 1);
});

test('784-case boundary matrix: clean accuracy, legacy noise limitations and live rejection', () => {
  let cases = 0, cleanLong = 0, noisyLong = 0, remainingFailures = 0;
  for (const bpm of [38, 39, 40, 41, 42, 44, 45, 50, 55, 60, 72, 90, 100, 130]) {
    for (const durationSec of [2, 5, 7, 10, 12, 27, 57]) for (const seed of [1, 2, 3, 42]) for (const noiseAmp of [0.2, 1.5]) {
      cases++;
      const result = analyzePpgSignal(generateSyntheticPPG({ bpm, durationSec, seed, noiseAmp }), TARGET_FS);
      assert.ok(Number.isFinite(result.bpm) && Number.isFinite(result.cv));
      if (durationSec < 12) continue; // short windows are diagnostics, not guaranteed low-HR capture
      if (bpm < MIN_TRACKING_BPM) {
        if (noiseAmp === 0.2) assert.notEqual(result.filterState.mode, 'tracking', `${bpm}/${durationSec}/${seed}`);
        continue;
      }
      const error = Math.abs(result.bpm - bpm);
      if (noiseAmp === 0.2) {
        cleanLong++;
        assert.ok(error <= 3, `clean ${bpm}/${durationSec}/${seed}: ${result.bpm}`);
      } else {
        noisyLong++;
        if (error > 6) {
          remainingFailures++;
          assert.ok(legacyNoisyFailures.has(`${bpm}/${durationSec}/${seed}`), `new noisy regression: ${bpm}/${durationSec}/${seed}: ${result.bpm}`);
          assert.equal(canDisplayLiveBpm(result), false, 'unreliable estimate must not pass the existing live gate');
        }
      }
    }
  }
  assert.equal(cases, 784);
  assert.equal(cleanLong, 144);
  assert.equal(noisyLong, 144);
  assert.ok(remainingFailures <= 8, `${remainingFailures} noisy failures exceed retained limit`);
});

test('40 BPM tracking can recover from old stored bands and different priors during live updates', () => {
  for (const priorBpm of [55, 72, 130]) for (const seed of [1, 2, 42]) for (const locked of [false, true]) {
    const full = generateSyntheticPPG({ bpm: 40, durationSec: 27, noiseAmp: 0.2, seed });
    let prevFilter = { hp: 0.7, lp: 4, centerBpm: priorBpm, locked };
    let result;
    for (let seconds = 5; seconds <= 27; seconds += 2) {
      result = analyzePpgSignal(full.slice(0, seconds * TARGET_FS), TARGET_FS, { priorBpm, prevFilter });
      prevFilter = result.filterState;
      if (canDisplayLiveBpm(result)) assert.ok(Math.abs(result.bpm - 40) <= 3, `live prior=${priorBpm} @${seconds}: ${result.bpm}`);
    }
    assert.ok(Math.abs(result.bpm - 40) <= 3);
    assert.equal(result.filterState.mode, 'tracking');
  }
});

test('calibration stores quality 40 BPM without deleting old records or changing storage keys', () => {
  const data = new Map([[CALIB_STORAGE_KEY, JSON.stringify([{ bpm: 72, hp: 0.7, lp: 4 }])]]);
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } };
  try {
    const filter = { hp: 0.5, lp: 1.52 };
    saveCalibrationSample(39, filter, 90);
    saveCalibrationSample(40, filter, 49);
    assert.equal(loadCalibrationBaseline().count, 1);
    saveCalibrationSample(40, filter, 90);
    assert.equal(loadCalibrationBaseline().count, 2);
    assert.equal(loadCalibrationBaseline().priorBpm, 56);
    data.delete(CALIB_STORAGE_KEY);
    assert.equal(loadCalibrationBaseline().avgHp, DEFAULT_HP_HZ);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});


test('slow drift alone cannot lock new low-BPM tracking or pass the live gate', () => {
  for (const hz of [0.2, 0.3, 0.5, 0.6]) {
    const signal = Float64Array.from({ length: 27 * TARGET_FS }, (_, i) => 150 + 10 * Math.sin(2 * Math.PI * hz * i / TARGET_FS));
    const result = analyzePpgSignal(signal, TARGET_FS);
    assert.notEqual(result.filterState.mode, 'tracking');
    assert.equal(result.filterState.locked, false);
    assert.equal(canDisplayLiveBpm(result), false);
  }
  assert.equal(canDisplayLiveBpm({ bpm: 39, qualityScore: 100, estimator: { agreement: 3, source: 'consensus' }, filterState: { mode: 'wide' } }), false);
});

test('low-BPM results remain stable across starting phases and sparse motion-like spikes', () => {
  for (const bpm of [40, 41, 42, 44, 45]) for (const seconds of [12, 27, 57]) {
    for (const phaseSec of [0, 0.35, 0.8, 1.2]) for (const seed of [1, 3, 42]) {
      const full = generateSyntheticPPG({ bpm, durationSec: seconds + 2, noiseAmp: 0.2, seed });
      const start = Math.round(phaseSec * TARGET_FS);
      const result = analyzePpgSignal(full.slice(start, start + seconds * TARGET_FS), TARGET_FS);
      assert.ok(Math.abs(result.bpm - bpm) <= 3, `${bpm}/${seconds}/${phaseSec}/${seed}: ${result.bpm}`);
    }
  }
  for (const seed of [1, 2, 42]) {
    const signal = generateSyntheticPPG({ bpm: 40, durationSec: 27, noiseAmp: 0.2, seed });
    for (const i of [55, 167, 310]) signal[i] += 5;
    const result = analyzePpgSignal(signal, TARGET_FS);
    assert.ok(Math.abs(result.bpm - 40) <= 3);
    assert.equal(result.filterState.mode, 'tracking');
  }
});
