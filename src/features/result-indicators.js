// UI-only mapping for the existing DSP status boundaries; the PPG analysis itself stays unchanged.
export const BRADY_BPM_THRESHOLD = 60;
export const TACHY_BPM_THRESHOLD = 100;
export const GOOD_SIGNAL_QUALITY = 70;
export const ACCEPTABLE_SIGNAL_QUALITY = 50;

export function getResultIndicators(record = {}) {
  const bpm = Number(record.bpm);
  const quality = record.quality == null ? Number.NaN : Number(record.quality);
  return {
    arrhythmia: Boolean(record.irregular) || record.status === 'irregular',
    bradycardia: record.status === 'brady' || bpm < BRADY_BPM_THRESHOLD,
    tachycardia: record.status === 'tachy' || bpm > TACHY_BPM_THRESHOLD,
    quality: Number.isFinite(quality)
      ? (quality >= GOOD_SIGNAL_QUALITY ? 'good' : quality >= ACCEPTABLE_SIGNAL_QUALITY ? 'fair' : 'poor')
      : 'unknown'
  };
}
