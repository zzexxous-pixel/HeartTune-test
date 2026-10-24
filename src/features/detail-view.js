/**
 * src/features/detail-view.js
 * HeartTune — "자세히 보기" 뷰모델 (단일 소스)
 *
 * 측정 결과의 자세히 보기 시트, 측정 이력의 자세히 보기 화면, 공유 이미지가
 * 같은 내용·같은 순서를 그리도록 내용을 이 한 곳에서 정의한다.
 *  · DOM 렌더러(main.js renderDetails)와 캔버스 렌더러(share.js)가 함께 소비한다.
 *  · 문구는 i18n 키로만 다루고, 수치는 레코드의 사실 정보만 담는다.
 */

import { getResultIndicators } from './result-indicators.js';

/**
 * @param {object} record 측정 기록 (storage.js 형식)
 * @param {{t: Function, formatDateTime: Function, formatNumber?: Function}} fmt
 * @returns {object} 상세 화면 뷰모델
 */
export function buildDetailViewModel(record, { t, formatDateTime, formatNumber = (v) => String(v) }) {
  const indicators = getResultIndicators(record);

  // 자세히 보기 순서 그대로: 맥박 → 측정일시·측정시간 → 파형 → 참고 신호 → 참고 고지
  return {
    brand: t('app.brand.name'),
    bpm: {
      label: t('details.heartRate'),
      value: formatNumber(record.bpm),
      unit: t('measure.unit.bpm')
    },
    meta: [
      { key: 'date', label: t('details.measurementTime'), value: formatDateTime(record.timestamp) },
      { key: 'duration', label: t('details.duration'), value: t('details.duration.value', { seconds: record.duration }) }
    ],
    waveform: {
      title: t('measure.waveform.title'),
      values: Array.isArray(record.waveform) ? record.waveform : []
    },
    indicators: [
      {
        key: 'arrhythmia',
        label: t('measure.indicator.arrhythmia'),
        state: t(indicators.arrhythmia ? 'measure.indicator.detected' : 'measure.indicator.notDetected'),
        tone: indicators.arrhythmia ? 'active' : 'clear',
        hint: t('measure.indicator.arrhythmiaHint')
      },
      {
        key: 'bradycardia',
        label: t('measure.indicator.bradycardia'),
        state: t(indicators.bradycardia ? 'measure.indicator.detected' : 'measure.indicator.notDetected'),
        tone: indicators.bradycardia ? 'active' : 'clear',
        hint: t('measure.indicator.bradycardiaHint')
      },
      {
        key: 'tachycardia',
        label: t('measure.indicator.tachycardia'),
        state: t(indicators.tachycardia ? 'measure.indicator.detected' : 'measure.indicator.notDetected'),
        tone: indicators.tachycardia ? 'active' : 'clear',
        hint: t('measure.indicator.tachycardiaHint')
      },
      {
        key: 'signal-quality',
        label: t('measure.indicator.signalQuality'),
        state: t(`measure.indicator.quality.${indicators.quality}`),
        tone: `quality-${indicators.quality}`,
        quality: indicators.quality,
        hint: t('measure.indicator.signalQualityHint')
      }
    ],
    legal: t('legal.disclaimer.main')
  };
}
