import test from 'node:test';
import assert from 'node:assert/strict';
import { getHistoryPresentation, getResultIndicators } from '../src/features/result-indicators.js';
import { setLang, t } from '../src/i18n.js';

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

test('History presentation labels no flags normal and combines all detected suspicions', () => {
  assert.deepEqual(getHistoryPresentation({ status: 'normal', bpm: 72 }), {
    signals: [],
    isAbnormal: false,
    abnormalRate: false
  });
  assert.deepEqual(getHistoryPresentation({ status: 'irregular', irregular: true, bpm: 72 }), {
    signals: ['arrhythmia'],
    isAbnormal: true,
    abnormalRate: false
  });
  assert.deepEqual(getHistoryPresentation({ status: 'normal', bpm: 55 }), {
    signals: ['bradycardia'],
    isAbnormal: true,
    abnormalRate: true
  });
  assert.deepEqual(getHistoryPresentation({ status: 'irregular', irregular: true, bpm: 105 }), {
    signals: ['arrhythmia', 'tachycardia'],
    isAbnormal: true,
    abnormalRate: true
  });
  assert.deepEqual(getHistoryPresentation({ status: 'normal', bpm: 60 }), {
    signals: [],
    isAbnormal: false,
    abnormalRate: false
  });
});

test('History labels use one trailing suspicion suffix and share titles match both locales', () => {
  setLang('ko');
  const suspectedKo = (names) => t('history.status.suspected', {
    signals: names.map((name) => t(`measure.indicator.${name}`)).join(', ')
  });
  assert.equal(suspectedKo(['arrhythmia']), '부정맥 의심');
  assert.equal(suspectedKo(['bradycardia']), '서맥 의심');
  assert.equal(suspectedKo(['tachycardia']), '빈맥 의심');
  assert.equal(suspectedKo(['arrhythmia', 'bradycardia']), '부정맥, 서맥 의심');
  assert.equal(suspectedKo(['arrhythmia', 'bradycardia', 'tachycardia']), '부정맥, 서맥, 빈맥 의심');
  assert.equal(t('share.card.title'), '❤️ 오늘심박 (HeartTune)');

  setLang('en');
  const suspectedEn = t('history.status.suspected', { signals: 'Arrhythmia, Bradycardia' });
  assert.equal(suspectedEn, 'Possible Arrhythmia, Bradycardia');
  assert.equal(t('share.card.title'), '❤️ HeartTune');
  setLang('ko');
});
