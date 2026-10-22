/**
 * tests/detail-view.test.js
 * "자세히 보기" 뷰모델 단위 테스트 — 측정 결과 상세·이력 상세·공유 이미지가
 * 같은 단일 소스(detail-view.js)에서 내용을 받는지 검증한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDetailViewModel } from '../src/features/detail-view.js';

const t = (key, params = {}) => {
  const table = {
    'app.brand.name': '오늘심박',
    'details.heartRate': '맥박',
    'details.measurementTime': '측정일시',
    'details.duration': '측정시간',
    'details.duration.value': '{seconds}초',
    'measure.unit.bpm': '회/분',
    'measure.waveform.title': '카메라 측정 파형',
    'measure.indicator.arrhythmia': '부정맥',
    'measure.indicator.bradycardia': '서맥',
    'measure.indicator.tachycardia': '빈맥',
    'measure.indicator.signalQuality': '측정 신호 품질',
    'measure.indicator.arrhythmiaHint': '부정맥 힌트',
    'measure.indicator.bradycardiaHint': '서맥 힌트',
    'measure.indicator.tachycardiaHint': '빈맥 힌트',
    'measure.indicator.signalQualityHint': '품질 힌트',
    'measure.indicator.detected': '신호 있음',
    'measure.indicator.notDetected': '신호 없음',
    'measure.indicator.quality.good': '좋음',
    'measure.indicator.quality.fair': '보통',
    'measure.indicator.quality.poor': '낮음',
    'measure.indicator.quality.unknown': '확인 불가',
    'legal.disclaimer.main': '참고 고지'
  };
  let str = table[key] ?? key;
  for (const [k, v] of Object.entries(params)) str = str.replace(`{${k}}`, String(v));
  return str;
};

const fmt = {
  t,
  formatDateTime: (ts) => new Date(ts).toISOString().slice(0, 10),
  formatNumber: (v) => String(v)
};

test('정상 기록: 자세히 보기 순서(맥박→측정일시·측정시간→파형→지표→고지)를 유지한다', () => {
  const model = buildDetailViewModel(
    { bpm: 72, timestamp: 1792454400000, duration: 30, waveform: [0, 1, 0], status: 'normal', irregular: false, quality: 80 },
    fmt
  );
  assert.equal(model.brand, '오늘심박');
  assert.equal(model.bpm.label, '맥박');
  assert.equal(model.bpm.value, '72');
  assert.equal(model.bpm.unit, '회/분');
  assert.deepEqual(model.meta.map((m) => m.key), ['date', 'duration']);
  assert.equal(model.meta[1].value, '30초');
  assert.equal(model.waveform.title, '카메라 측정 파형');
  assert.deepEqual(model.waveform.values, [0, 1, 0]);
  assert.deepEqual(model.indicators.map((i) => i.key), ['arrhythmia', 'bradycardia', 'tachycardia', 'signal-quality']);
  assert.equal(model.legal, '참고 고지');
});

test('지표 상태: 부정맥+서맥 기록에서 해당 지표만 활성화된다', () => {
  const model = buildDetailViewModel(
    { bpm: 55, timestamp: 0, duration: 15, waveform: [], status: 'irregular', irregular: true, quality: 65 },
    fmt
  );
  const byKey = Object.fromEntries(model.indicators.map((i) => [i.key, i]));
  assert.equal(byKey.arrhythmia.tone, 'active');
  assert.equal(byKey.arrhythmia.state, '신호 있음');
  assert.equal(byKey.bradycardia.tone, 'active');
  assert.equal(byKey.tachycardia.tone, 'clear');
  assert.equal(byKey.tachycardia.state, '신호 없음');
  assert.equal(byKey['signal-quality'].tone, 'quality-fair');
  assert.equal(byKey['signal-quality'].state, '보통');
  assert.equal(byKey['signal-quality'].quality, 'fair');
});

test('품질 없는 기록은 신호 품질이 확인 불가로 표시된다', () => {
  const model = buildDetailViewModel({ bpm: 80, timestamp: 0, duration: 30, waveform: [] }, fmt);
  const quality = model.indicators.find((i) => i.key === 'signal-quality');
  assert.equal(quality.tone, 'quality-unknown');
  assert.equal(quality.state, '확인 불가');
  assert.deepEqual(model.waveform.values, []);
});
