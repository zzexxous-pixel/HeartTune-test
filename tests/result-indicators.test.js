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
  assert.equal(t('measure.waveform.title'), '카메라 측정 파형');
  assert.equal(t('guide.rhythm.url'), 'https://sev.severance.healthcare/sev/news/press/medical-report.do?mode=view&articleNo=129731&title=%5B%EC%84%B8%EB%B8%8C%EB%9E%80%EC%8A%A4%EB%B3%91%EC%9B%90%5D+%EB%B6%80%EC%A0%95%EB%A7%A5');
  const combined = getHistoryPresentation({ status: 'irregular', irregular: true, bpm: 110 });
  const combinedTerms = combined.signals.map((name) => t(`measure.indicator.${name}`)).join(', ');
  assert.equal(t('result.signals.summary', { signals: combinedTerms }), '부정맥, 빈맥 참고 신호');

  setLang('en');
  const suspectedEn = t('history.status.suspected', { signals: 'Arrhythmia, Bradycardia' });
  assert.equal(suspectedEn, 'Possible Arrhythmia, Bradycardia');
  assert.equal(t('share.card.title'), '❤️ HeartTune');
  assert.equal(t('measure.waveform.title'), 'Camera-measured waveform');
  assert.equal(t('result.signals.summary', { signals: 'Arrhythmia, Tachycardia' }), 'Signals: Arrhythmia, Tachycardia');
  assert.equal(t('guide.rhythm.url'), 'https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia');
  setLang('ko');
});
