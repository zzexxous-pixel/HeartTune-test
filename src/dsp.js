/**
 * src/dsp.js
 * 오늘심박 (HeartTune) — 적응형 PPG 디지털 신호처리(DSP) 파이프라인
 * - 적응형 R/G 채널 추출
 * - 15Hz 균일 재표본화 및 선형 추세(DC) 제거
 * - 5~10초 고속 캘리브레이션 + 기저 심박수(Prior HR) 폴백 + 동적 필터 트래킹 & Hold
 * - 한닝 창 + Radix-2 FFT(부포물선 보간) + 자기상관 교차검증
 * - 양극 포락선(Positive Envelope) 박동 검출 및 IBI/CV/RMSSD 리듬 판정
 */

export const TARGET_FS = 15; // 균일 재표본화 주파수 (15 Hz)
// Supported tracking range differs from filter transition/search margins.
export const MIN_TRACKING_BPM = 40;
export const MAX_TRACKING_BPM = 195;
export const DEFAULT_HP_HZ = 0.7;
const MIN_ADAPTIVE_HP_HZ = 0.5;
const MIN_SEARCH_BPM = MIN_TRACKING_BPM - 2; // margin for interpolation near the 40 BPM boundary


/**
 * 1. 카메라 프레임 중앙 50% 영역에서 적응형 PPG 스칼라 값 추출
 */
export function extractFrameSample(rgba, width = 64, height = 64) {
  const xStart = Math.floor(width * 0.25);
  const xEnd = Math.floor(width * 0.75);
  const yStart = Math.floor(height * 0.25);
  const yEnd = Math.floor(height * 0.75);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * width + x) * 4;
      rSum += rgba[idx];
      gSum += rgba[idx + 1];
      bSum += rgba[idx + 2];
      count++;
    }
  }

  const rMean = count > 0 ? rSum / count : 0;
  const gMean = count > 0 ? gSum / count : 0;
  const bMean = count > 0 ? bSum / count : 0;
  const brightness = (rMean + gMean + bMean) / 3;

  const isRedDominant = rMean > 60 && rMean > gMean * 1.4;
  const channel = isRedDominant ? 'R' : 'G';
  const value = channel === 'R' ? rMean : gMean;

  let qualityHint = 'ok';
  let isFingerDetected = true;

  if (brightness < 18 && rMean < 25) {
    isFingerDetected = false;
    qualityHint = 'tooDark';
  } else if (brightness > 248 && gMean > 240 && bMean > 240) {
    isFingerDetected = false;
    qualityHint = 'tooBright';
  } else if (!isRedDominant && brightness < 35) {
    isFingerDetected = false;
    qualityHint = 'pressHarder';
  }

  return {
    value,
    rMean,
    gMean,
    bMean,
    channel,
    isFingerDetected,
    qualityHint
  };
}

/**
 * 2. 가변 FPS 시계열을 균일 샘플링 주파수(15 Hz)로 선형 보간 재표본화
 */
export function resampleUniform(samples, targetFs = TARGET_FS) {
  if (!samples || samples.length < 2) return new Float64Array(0);

  const t0 = samples[0].t;
  const tEnd = samples[samples.length - 1].t;
  const durationSec = (tEnd - t0) / 1000;
  if (durationSec <= 0) return new Float64Array(0);

  const totalPoints = Math.floor(durationSec * targetFs) + 1;
  const out = new Float64Array(totalPoints);
  const dtMs = 1000 / targetFs;

  let srcIdx = 0;
  for (let i = 0; i < totalPoints; i++) {
    const targetT = t0 + i * dtMs;
    while (srcIdx < samples.length - 2 && samples[srcIdx + 1].t < targetT) {
      srcIdx++;
    }
    const s0 = samples[srcIdx];
    const s1 = samples[srcIdx + 1];
    const span = s1.t - s0.t;
    if (span <= 0) {
      out[i] = s0.v;
    } else {
      const ratio = Math.max(0, Math.min(1, (targetT - s0.t) / span));
      out[i] = s0.v + ratio * (s1.v - s0.v);
    }
  }
  return out;
}

/**
 * 3. 평균(DC) 및 선형 추세 제거
 */
export function removeDCAndDetrend(signal) {
  const n = signal.length;
  if (n === 0) return new Float64Array(0);

  let sumY = 0;
  let sumX = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += signal[i];
    sumXY += i * signal[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = signal[i] - (slope * i + intercept);
  }
  return out;
}

function createBiquadCoeffs(type, cutoffHz, fs) {
  const nyquist = fs / 2;
  const clampedFc = Math.max(0.1, Math.min(nyquist * 0.95, cutoffHz));
  const omega = Math.tan((Math.PI * clampedFc) / fs);
  const omega2 = omega * omega;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * omega + omega2);

  if (type === 'lowpass') {
    const b0 = omega2 * norm;
    const b1 = 2 * b0;
    const b2 = b0;
    const a1 = 2 * (omega2 - 1) * norm;
    const a2 = (1 - sqrt2 * omega + omega2) * norm;
    return { b0, b1, b2, a1, a2 };
  } else {
    const b0 = 1 * norm;
    const b1 = -2 * b0;
    const b2 = b0;
    const a1 = 2 * (omega2 - 1) * norm;
    const a2 = (1 - sqrt2 * omega + omega2) * norm;
    return { b0, b1, b2, a1, a2 };
  }
}

function applyBiquadOnce(signal, coeffs) {
  const n = signal.length;
  const out = new Float64Array(n);
  const { b0, b1, b2, a1, a2 } = coeffs;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < n; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function filtfiltBiquad(signal, coeffs) {
  const n = signal.length;
  if (n < 8) return Float64Array.from(signal);

  const forward = applyBiquadOnce(signal, coeffs);
  const reversed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    reversed[i] = forward[n - 1 - i];
  }
  const backward = applyBiquadOnce(reversed, coeffs);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = backward[n - 1 - i];
  }
  return out;
}

/**
 * 4. 대역통과 필터 (동적 차단 주파수 지원, 기본 0.7 ~ 4.0 Hz)
 */
export function bandpassFilter(rawSignal, fs = TARGET_FS, hpCutoff = DEFAULT_HP_HZ, lpCutoff = 4.0) {
  const safeHp = Math.max(0.4, Math.min(2.2, hpCutoff));
  const safeLp = Math.max(safeHp + 0.5, Math.min(5.0, lpCutoff));
  const detrended = removeDCAndDetrend(rawSignal);
  const hpCoeffs = createBiquadCoeffs('highpass', safeHp, fs);
  const lpCoeffs = createBiquadCoeffs('lowpass', safeLp, fs);

  const highpassed = filtfiltBiquad(detrended, hpCoeffs);
  const bandpassed = filtfiltBiquad(highpassed, lpCoeffs);
  return removeDCAndDetrend(bandpassed);
}

/**
 * 5. Radix-2 FFT + 한닝(Hanning) 창 + 부포물선 보간 기반 BPM 추정
 */
export function estimateBpmFFT(filteredSignal, fs = TARGET_FS) {
  const n = filteredSignal.length;
  if (n < fs * 3) {
    return { bpm: 0, confidence: 0, peakFreqHz: 0 };
  }

  let fftSize = 512;
  while (fftSize < n * 2) {
    fftSize <<= 1;
  }

  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = filteredSignal[i] * w;
  }

  let j = 0;
  for (let i = 0; i < fftSize; i++) {
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
    let m = fftSize >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let len = 2; len <= fftSize; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wLenRe = Math.cos(angle);
    const wLenIm = Math.sin(angle);

    for (let i = 0; i < fftSize; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < halfLen; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + halfLen] * wRe - im[i + k + halfLen] * wIm;
        const vIm = re[i + k + halfLen] * wIm + im[i + k + halfLen] * wRe;

        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + halfLen] = uRe - vRe;
        im[i + k + halfLen] = uIm - vIm;

        const nextWRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextWRe;
      }
    }
  }

  const minBin = Math.max(1, Math.floor(((MIN_SEARCH_BPM / 60) * fftSize) / fs));
  const maxBin = Math.min((fftSize >> 1) - 2, Math.ceil((3.6 * fftSize) / fs));

  const mag = new Float64Array(fftSize >> 1);
  let maxMag = 0;
  let maxIdx = minBin;
  let totalEnergy = 0;

  for (let k = minBin; k <= maxBin; k++) {
    const m = Math.hypot(re[k], im[k]);
    mag[k] = m;
    totalEnergy += m;
    if (m > maxMag) {
      maxMag = m;
      maxIdx = k;
    }
  }

  if (maxMag <= 0) {
    return { bpm: 0, confidence: 0, peakFreqHz: 0 };
  }

  const y1 = mag[maxIdx - 1] || 0;
  const y2 = mag[maxIdx];
  const y3 = mag[maxIdx + 1] || 0;
  const denom = y1 - 2 * y2 + y3;
  const delta = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y1 - y3)) / denom)) : 0;

  const refinedBin = maxIdx + delta;
  const peakFreqHz = (refinedBin * fs) / fftSize;
  const bpm = peakFreqHz * 60;
  const avgEnergy = totalEnergy / Math.max(1, maxBin - minBin + 1);
  const snrRatio = avgEnergy > 0 ? maxMag / avgEnergy : 0;
  const confidence = Math.max(0, Math.min(1, (snrRatio - 1.5) / 6));

  return { bpm, confidence, peakFreqHz };
}

/**
 * 6. 자기상관(Autocorrelation) 기반 BPM 추정
 */
export function estimateBpmAutocorr(filteredSignal, fs = TARGET_FS) {
  const n = filteredSignal.length;
  const minLag = Math.max(2, Math.floor(fs * (60 / 210)));
  const maxLag = Math.min(n - 2, Math.ceil(fs * (60 / MIN_SEARCH_BPM)));
  if (maxLag <= minLag) return 0;

  let zeroLagEnergy = 0;
  for (let i = 0; i < n; i++) {
    zeroLagEnergy += filteredSignal[i] * filteredSignal[i];
  }
  if (zeroLagEnergy <= 1e-9) return 0;

  const corr = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += filteredSignal[i] * filteredSignal[i + lag];
    }
    corr[lag] = sum / zeroLagEnergy;
  }

  let bestLag = minLag;
  let bestVal = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    if (corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      if (corr[lag] > bestVal) {
        bestVal = corr[lag];
        bestLag = lag;
      }
    }
  }

  if (bestVal <= 0.05) return 0;

  const y1 = corr[bestLag - 1];
  const y2 = corr[bestLag];
  const y3 = corr[bestLag + 1];
  const denom = y1 - 2 * y2 + y3;
  const delta = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y1 - y3)) / denom)) : 0;
  const refinedLag = bestLag + delta;

  return (60 * fs) / refinedLag;
}

function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * 7. 양극 포락선(Positive Envelope) 기반 박동 검출기
 */
export function detectBeats(filteredSignal, fs = TARGET_FS) {
  const n = filteredSignal.length;
  if (n < fs * 2) return [];

  const posEnv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    posEnv[i] = filteredSignal[i] > 0 ? filteredSignal[i] : 0;
  }

  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = posEnv[Math.max(0, i - 1)];
    const curr = posEnv[i];
    const next = posEnv[Math.min(n - 1, i + 1)];
    smooth[i] = (prev + curr + next) / 3;
  }

  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (smooth[i] > 0 && smooth[i] >= smooth[i - 1] && smooth[i] > smooth[i + 1]) {
      candidates.push({ idx: i, amp: smooth[i] });
    }
  }
  if (candidates.length === 0) return [];

  const amps = candidates.map((c) => c.amp);
  const p90 = percentile(amps, 90);
  const threshold = p90 * 0.35;

  const validCandidates = candidates.filter((c) => c.amp >= threshold);
  if (validCandidates.length === 0) return [];

  validCandidates.sort((a, b) => b.amp - a.amp);
  const minGapSamples = Math.max(4, Math.round(0.30 * fs));
  const selectedIndices = [];

  for (const cand of validCandidates) {
    let tooClose = false;
    for (const selIdx of selectedIndices) {
      if (Math.abs(cand.idx - selIdx) < minGapSamples) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selectedIndices.push(cand.idx);
    }
  }

  selectedIndices.sort((a, b) => a - b);

  return selectedIndices.map((idx) => {
    const y1 = smooth[idx - 1] || 0;
    const y2 = smooth[idx];
    const y3 = smooth[idx + 1] || 0;
    const denom = y1 - 2 * y2 + y3;
    const delta = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y1 - y3)) / denom)) : 0;
    return (idx + delta) / fs;
  });
}

/**
 * 8. 박동 시각 배열로부터 IBI 변동성(CV, RMSSD) 및 리듬 불규칙 판정
 */
export function evaluateRhythm(beatTimesSec, durationSec, expectedBpm = 72) {
  if (!beatTimesSec || beatTimesSec.length < 3) {
    return {
      beatCount: beatTimesSec ? beatTimesSec.length : 0,
      ibiListMs: [],
      meanIbiMs: 0,
      medianBpm: 0,
      cv: 0,
      rmssdMs: 0,
      irregular: false,
      reliable: false,
      isShortMeasurement: durationSec < 20
    };
  }

  const rawIbis = [];
  for (let i = 1; i < beatTimesSec.length; i++) {
    const ibiMs = (beatTimesSec[i] - beatTimesSec[i - 1]) * 1000;
    if (ibiMs >= 250 && ibiMs <= 1600) {
      rawIbis.push(ibiMs);
    }
  }

  if (rawIbis.length < 2) {
    return {
      beatCount: beatTimesSec.length,
      ibiListMs: rawIbis,
      meanIbiMs: 0,
      medianBpm: 0,
      cv: 0,
      rmssdMs: 0,
      irregular: false,
      reliable: false,
      isShortMeasurement: durationSec < 20
    };
  }

  const sortedIbi = [...rawIbis].sort((a, b) => a - b);
  const medianIbiMs = sortedIbi[Math.floor(sortedIbi.length / 2)];

  // 1차 정제: 중앙값의 [0.45, 1.85] 배를 벗어나는 극단 IBI 제거
  const cleanIbis = rawIbis.filter((ibi) => ibi <= medianIbiMs * 1.85 && ibi >= medianIbiMs * 0.45);

  // 2차 정제(MAD): 박동 검출 오류(이중 검출·놓침·안정화 구간 가짜 피크)로 생긴
  // '튀는' IBI만 중앙값 ± 3.5×MAD 안쪽으로 좁혀 제거한다. 문턱이 실제 변동 폭에
  // 비례하므로 연속적으로 넓게 변하는 불규칙 리듬(부정맥)은 그대로 보존된다.
  // (2026-10-24 실측: 화면 파형은 안정적이었으나 초반 자동노출 요동의 가짜 박동이
  //  짧은 IBI를 만들어 정상 리듬을 부정맥으로 오탐되던 사례 대응)
  const deviations = cleanIbis.map((ibi) => Math.abs(ibi - medianIbiMs));
  const madMs = percentile(deviations, 50);
  const robustLimitMs = Math.max(3.5 * madMs, 40);
  const robustIbis = cleanIbis.filter((ibi) => Math.abs(ibi - medianIbiMs) <= robustLimitMs);
  const targetIbis = robustIbis.length >= 2 ? robustIbis : (cleanIbis.length >= 2 ? cleanIbis : rawIbis);

  const meanIbiMs = targetIbis.reduce((a, b) => a + b, 0) / targetIbis.length;
  const variance = targetIbis.reduce((acc, val) => acc + Math.pow(val - meanIbiMs, 2), 0) / targetIbis.length;
  const stdDev = Math.sqrt(variance);
  const cv = meanIbiMs > 0 ? stdDev / meanIbiMs : 0;

  let diffSqSum = 0;
  for (let i = 1; i < targetIbis.length; i++) {
    const diff = targetIbis[i] - targetIbis[i - 1];
    diffSqSum += diff * diff;
  }
  const rmssdMs = targetIbis.length > 1 ? Math.sqrt(diffSqSum / (targetIbis.length - 1)) : 0;

  const expectedBeats = (expectedBpm / 60) * durationSec;
  const minRequiredBeats = Math.max(8, Math.floor(expectedBeats * 0.4));
  const reliable = beatTimesSec.length >= minRequiredBeats;
  const isShortMeasurement = durationSec < 20;

  const irregular = reliable && cv > 0.14;
  const medianBpm = medianIbiMs > 0 ? 60000 / medianIbiMs : 0;

  return {
    beatCount: beatTimesSec.length,
    ibiListMs: targetIbis,
    meanIbiMs: Math.round(meanIbiMs),
    medianBpm,
    cv: Number(cv.toFixed(4)),
    rmssdMs: Math.round(rmssdMs),
    irregular,
    reliable,
    isShortMeasurement
  };
}

/**
 * 8-1. 주파수 후보(FFT / 자기상관 / IBI 중앙값)의 옥타브 오류(하모닉 혼동) 해소
 *
 * 왜 필요한가:
 *   손가락 PPG 파형은 수축기 피크 + 중첩파(dicrotic wave) + 골짜기로 구성되어
 *   스펙트럼에 2차·3차 하모닉이 강하게 나타난다. 저박동(45~60 BPM)에서는
 *   2차 하모닉이 기본파보다 커지는 경우가 있어, FFT 최대 피크만 쓰면
 *   "2배 BPM"을 고른다. 그 값이 필터 트래킹 중심이 되면 대역이 잘못 좁혀져
 *   박동 검출기까지 2배로 세는 연쇄 오류가 발생한다.
 *
 * 해결:
 *   세 추정치를 동시에 보고 "합의(consensus)"를 우선하며,
 *   ① 주파수 두 개(FFT·자기상관)가 서로 일치하면 그 합의를 신뢰하고,
 *   ② 불일치하면 시간영역(IBI 중앙값)을 중재자로 사용한다.
 *   시간영역은 0.30초 불응기(refractory) 덕분에 중첩파를 박동으로 세지 않으므로
 *   하모닉 혼동에 강하다.
 *
 * @returns {{bpm:number, source:string, agreement:number, isHarmonicCorrected:boolean}}
 *   source: 'consensus' | 'frequency' | 'time-domain' | 'early-time-domain' | 'prior'
 *   agreement: 12% 이내로 서로 일치한 추정치 개수 (0~3)
 */
export function resolveBpmEstimate({
  fftBpm = 0,
  autocorrBpm = 0,
  beatMedianBpm = 0,
  beatCount = 0,
  durationSec = 0,
  priorBpm = 72,
  minBeats = 8
} = {}) {
  const isValid = (v) => Number.isFinite(v) && v >= 30 && v <= 220;
  const relDiff = (a, b) => (Math.max(a, b) > 0 ? Math.abs(a - b) / Math.max(a, b) : 1);
  const same = (a, b) => isValid(a) && isValid(b) && relDiff(a, b) <= 0.12;

  const fft = isValid(fftBpm) ? fftBpm : 0;
  const ac = isValid(autocorrBpm) ? autocorrBpm : 0;
  const median = beatCount >= 3 && isValid(beatMedianBpm) ? beatMedianBpm : 0;

  // 시간영역 신뢰 조건: 충분한 박동 수 (짧은 구간은 별도 처리)
  const beatsOk = median > 0 && beatCount >= minBeats;

  const agreement =
    (same(fft, ac) ? 2 : 0) +
    (median && same(median, fft) ? 1 : 0) +
    (median && same(median, ac) ? 1 : 0);

  // ① 10초 미만 초기 포착: 파형 주기가 아직 짧아 스펙트럼 해상도가 낮다.
  //    자기상관과 IBI 중앙값이 서로 일치하면 그 평균을 채택(기존 고속 포착 유지).
  if (durationSec > 0 && durationSec < 10 && ac >= MIN_SEARCH_BPM && median >= MIN_SEARCH_BPM && same(ac, median)) {
    return {
      bpm: (ac + median) / 2,
      source: 'early-time-domain',
      agreement: Math.max(agreement, 2),
      isHarmonicCorrected: false
    };
  }

  // ② 주파수 도메인 두 추정치가 합의 → 그 합의를 신뢰.
  //    (합의를 깨는 박동 수는 중첩파 오검출 또는 노이즈성 누락일 가능성이 높다)
  if (same(fft, ac)) {
    if (beatsOk && same(median, fft)) {
      return { bpm: (fft + ac + median) / 3, source: 'consensus', agreement: 3, isHarmonicCorrected: false };
    }
    return {
      bpm: (fft + ac) / 2,
      source: 'frequency',
      agreement: 2,
      isHarmonicCorrected: Boolean(median && relDiff(median, fft) > 0.25)
    };
  }

  // ③ 불일치(하모닉 혼동 가능) → 시간영역 중재
  if (beatsOk) {
    if (same(median, fft)) {
      return { bpm: (median + fft) / 2, source: 'time-domain', agreement: 2, isHarmonicCorrected: true };
    }
    if (same(median, ac)) {
      return { bpm: (median + ac) / 2, source: 'time-domain', agreement: 2, isHarmonicCorrected: true };
    }
    return { bpm: median, source: 'time-domain', agreement: 1, isHarmonicCorrected: true };
  }

  // ④ 박동 수가 부족 → 주파수 추정치 중 하나. 기저 심박수(prior)에 가까운 쪽을 선호.
  if (fft && ac) {
    const prior = isValid(priorBpm) ? priorBpm : 72;
    const chosen = Math.abs(fft - prior) <= Math.abs(ac - prior) ? fft : ac;
    return { bpm: chosen, source: 'frequency', agreement: 0, isHarmonicCorrected: false };
  }
  if (fft || ac) {
    return { bpm: fft || ac, source: 'frequency', agreement: 0, isHarmonicCorrected: false };
  }
  if (median) {
    return { bpm: median, source: 'time-domain', agreement: 0, isHarmonicCorrected: false };
  }

  const prior = isValid(priorBpm) ? priorBpm : 72;
  return { bpm: prior, source: 'prior', agreement: 0, isHarmonicCorrected: false };
}

/**
 * 9. 적응형 캘리브레이션 + 동적 주파수 추적(Tracking & Hold) 통합 파이프라인
 * @param {Float64Array|number[]} uniformSignal - 15Hz 균일 샘플링 시계열
 * @param {number} fs - 샘플링 주파수 (기본 15Hz)
 * @param {object} options
 *   - priorBpm: 로컬 스토리지 최근 30건 평균 기저 심박수 (예: 72)
 *   - prevFilter: 직전 주기의 필터 상태 { hp, lp, centerBpm, locked }
 *   - manualHp / manualLp: 디버그 콘솔 수동 튜닝 오버라이드 값
 */
export function analyzePpgSignal(uniformSignal, fs = TARGET_FS, options = {}) {
  const durationSec = uniformSignal.length / fs;
  const priorBpm = options.priorBpm || 72;
  const prevFilter = options.prevFilter || { hp: DEFAULT_HP_HZ, lp: 4.0, centerBpm: priorBpm, locked: false };

  // 1단계: 광대역(0.7~4.0Hz) 또는 수동 지정 대역으로 1차 스캔
  const initialHp = options.manualHp || DEFAULT_HP_HZ;
  const initialLp = options.manualLp || 4.0;
  const wideFiltered = bandpassFilter(uniformSignal, fs, initialHp, initialLp);

  const wideFft = estimateBpmFFT(wideFiltered, fs);
  const wideAutocorr = estimateBpmAutocorr(wideFiltered, fs);
  const wideBeats = detectBeats(wideFiltered, fs);
  const wideRhythm = evaluateRhythm(wideBeats, durationSec, wideFft.bpm || priorBpm);

  // 5~10초 구간에서도 빠른 포착을 위해 자기상관 + IBI 중앙값 + FFT 교차 평가
  // ▸ 하모닉(중첩파) 혼동을 해소한 통합 추정치를 사용한다.
  //   FFT 최대 피크만 쓰면 저박동에서 2차 하모닉을 기본파로 오인하여
  //   필터 트래킹 대역이 잘못 좁혀지고 박동이 2배로 검출되는 연쇄 오류가 생긴다.
  const wideEstimate = resolveBpmEstimate({
    fftBpm: wideFft.bpm,
    autocorrBpm: wideAutocorr,
    beatMedianBpm: wideRhythm.medianBpm,
    beatCount: wideBeats.length,
    durationSec,
    priorBpm,
    minBeats: durationSec < 10 ? 6 : 8
  });

  let candidateBpm = wideEstimate.bpm;

  // 품질 점수: 스펙트럼 신뢰도 + 추정치 합의도(consensus)를 함께 반영
  const consensusBonus = wideEstimate.agreement >= 2 ? 30 : 10;
  const rawQuality = Math.round(
    Math.min(100, Math.max(20, wideFft.confidence * 70 + consensusBonus))
  );

  // 2단계: 동적 필터 대역 결정 (Tracking vs Hold vs Prior Fallback)
  let activeHp = initialHp;
  let activeLp = initialLp;
  let centerBpm = candidateBpm || priorBpm;
  let tuningMode = 'wide'; // 'wide' | 'tracking' | 'hold' | 'prior-fallback' | 'manual'

  if (options.manualHp || options.manualLp) {
    tuningMode = 'manual';
  } else if (durationSec >= 4.5) {
    if (rawQuality < 45 && prevFilter && prevFilter.locked) {
      // 모션 아티팩트 등으로 신호 품질이 급락한 경우: 직전 깨끗했던 필터 대역을 그대로 유지 (Hold)
      activeHp = prevFilter.hp;
      activeLp = prevFilter.lp;
      centerBpm = prevFilter.centerBpm;
      tuningMode = 'hold';
    } else if (rawQuality < 45 && !prevFilter.locked) {
      // 초기 5초가 흔들려 포착 실패 시: 로컬 스토리지 기저 심박수(Prior HR)를 중심으로 구명조끼 대역 설정
      const priorHz = priorBpm / 60;
      activeHp = Math.max(MIN_ADAPTIVE_HP_HZ, Number((priorHz - 0.45).toFixed(2)));
      activeLp = Math.min(3.8, Number((priorHz + 0.65).toFixed(2)));
      centerBpm = priorBpm;
      tuningMode = 'prior-fallback';
    } else if (Math.round(candidateBpm) >= MIN_TRACKING_BPM && candidateBpm <= MAX_TRACKING_BPM
      && (candidateBpm >= 45 || wideEstimate.agreement >= 2)) {
      // 신호 양호: 포착된 심박수 주파수(centerHz)를 따라 필터 대역폭 이동 (Continuous Adaptive Tracking)
      // 단, 이전 중심 BPM과 3 BPM 이상 차이 날 때만 갱신하여 스로틀링
      const targetBpm =
        prevFilter.locked && Math.abs(candidateBpm - prevFilter.centerBpm) < 3
          ? prevFilter.centerBpm
          : candidateBpm;
      const centerHz = targetBpm / 60;
      // 중첩파(dicrotic wave, 약 2배주파수 성분 일부) 보존 및 호흡(0.2~0.3Hz) 차단을 동시에 만족하는 비대칭 패스밴드
      activeHp = Math.max(MIN_ADAPTIVE_HP_HZ, Number((centerHz * 0.62).toFixed(2)));
      activeLp = Math.min(4.0, Number(Math.max(centerHz * 2.15, centerHz + 0.85).toFixed(2)));
      centerBpm = targetBpm;
      tuningMode = 'tracking';
    }
  }

  // 3단계: 적응형 대역이 확정되면 해당 대역으로 최종 정밀 필터링 수행
  const filtered =
    tuningMode === 'wide' || tuningMode === 'manual'
      ? wideFiltered
      : bandpassFilter(uniformSignal, fs, activeHp, activeLp);

  const fftRes = estimateBpmFFT(filtered, fs);
  const autocorrBpm = estimateBpmAutocorr(filtered, fs);
  const beatTimes = detectBeats(filtered, fs);
  const rhythm = evaluateRhythm(beatTimes, durationSec, fftRes.bpm || centerBpm);

  const finalEstimate = resolveBpmEstimate({
    fftBpm: fftRes.bpm,
    autocorrBpm,
    beatMedianBpm: rhythm.medianBpm,
    beatCount: beatTimes.length,
    durationSec,
    priorBpm: centerBpm,
    minBeats: durationSec < 10 ? 6 : 8
  });

  const finalBpm = finalEstimate.bpm;
  const isCrossValidated = finalEstimate.agreement >= 2;

  const roundedBpm = Math.round(finalBpm || centerBpm);

  let status = 'normal';
  if (rhythm.irregular) {
    status = 'irregular';
  } else if (roundedBpm < 60) {
    status = 'brady';
  } else if (roundedBpm > 100) {
    status = 'tachy';
  }

  const qualityScore = Math.round(
    Math.min(100, Math.max(20, fftRes.confidence * 70 + (isCrossValidated ? 30 : 10)))
  );

  return {
    bpm: roundedBpm,
    rawFftBpm: Number(fftRes.bpm.toFixed(2)),
    autocorrBpm: Number(autocorrBpm.toFixed(2)),
    status,
    irregular: rhythm.irregular,
    reliable: rhythm.reliable,
    isShortMeasurement: rhythm.isShortMeasurement,
    beatCount: rhythm.beatCount,
    cv: rhythm.cv,
    rmssdMs: rhythm.rmssdMs,
    qualityScore,
    estimator: {
      source: finalEstimate.source,
      agreement: finalEstimate.agreement,
      harmonicCorrected: finalEstimate.isHarmonicCorrected,
      wideSource: wideEstimate.source
    },
    filteredSignal: filtered,
    beatTimes,
    filterState: {
      hp: activeHp,
      lp: activeLp,
      centerBpm: roundedBpm,
      locked: qualityScore >= 50 && roundedBpm >= MIN_TRACKING_BPM
        && (roundedBpm >= 45 || isCrossValidated),
      mode: tuningMode
    }
  };
}

/**
 * 10. 합성 PPG 신호 생성기 (단위 테스트 및 디버그 시뮬레이터 겸용)
 */
export function generateSyntheticPPG({
  bpm = 72,
  durationSec = 30,
  fs = TARGET_FS,
  jitterRatio = 0.02,
  noiseAmp = 0.25,
  dcLevel = 150,
  seed = 42
} = {}) {
  let state = seed >>> 0;
  const rand = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const totalSamples = Math.round(durationSec * fs);
  const signal = new Float64Array(totalSamples);
  const meanIbiSec = 60 / bpm;

  const beatCenters = [];
  let t = 0.4;
  while (t < durationSec + meanIbiSec) {
    beatCenters.push(t);
    const u = (rand() - 0.5) * 2;
    const nextIbi = Math.max(0.32, meanIbiSec * (1 + u * jitterRatio));
    t += nextIbi;
  }

  for (let i = 0; i < totalSamples; i++) {
    const curT = i / fs;
    let val = dcLevel;

    val += 1.2 * Math.sin(2 * Math.PI * 0.22 * curT);

    for (let b = 0; b < beatCenters.length; b++) {
      const dt = curT - beatCenters[b];
      if (dt < -0.5 || dt > 0.8) continue;

      const systolic = 4.5 * Math.exp(-(dt * dt) / (2 * 0.045 * 0.045));
      const dicroticDt = dt - 0.18;
      const dicrotic = 1.4 * Math.exp(-(dicroticDt * dicroticDt) / (2 * 0.055 * 0.055));
      const troughDt = dt + 0.14;
      const trough = -4.9 * Math.exp(-(troughDt * troughDt) / (2 * 0.06 * 0.06));

      val += systolic + dicrotic + trough;
    }

    const noise = (rand() + rand() + rand() - 1.5) * noiseAmp;
    signal[i] = val + noise;
  }

  return signal;
}