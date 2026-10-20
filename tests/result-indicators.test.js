import test from 'node:test';
import assert from 'node:assert/strict';
import { getResultIndicators } from '../src/features/result-indicators.js';

test('UI indicators reuse the existing BPM limits independently of DSP status priority', () => {
  assert.deepEqual(getResultIndicators({ status: 'normal', bpm: 60, quality: 70 }), {
    arrhythmia: false,
    bradycardia: false,
    tachycardia: false,
    quality: 'good'
  });
  assert.deepEqual(getResultIndicators({ status: 'normal', bpm: 59, quality: 50 }), {
    arrhythmia: false,
    bradycardia: true,
    tachycardia: false,
    quality: 'fair'
  });
  assert.deepEqual(getResultIndicators({ status: 'normal', bpm: 100 }), {
    arrhythmia: false,
    bradycardia: false,
    tachycardia: false,
    quality: 'unknown'
  });
  assert.deepEqual(getResultIndicators({ status: 'normal', bpm: 101, quality: 49 }), {
    arrhythmia: false,
    bradycardia: false,
    tachycardia: true,
    quality: 'poor'
  });
  assert.deepEqual(getResultIndicators({ status: 'irregular', irregular: true, bpm: 55 }), {
    arrhythmia: true,
    bradycardia: true,
    tachycardia: false,
    quality: 'unknown'
  });
});
