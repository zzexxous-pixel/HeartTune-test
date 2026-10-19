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
export function bandpassFilter(rawSignal, fs = TARGET_FS, hpCutoff = 0.7, lpCutoff = 4.0) {
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

  const minBin = Math.max(1, Math.floor((0.7 * fftSize) / fs));
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
  const maxLag = Math.min(n - 2, Math.ceil(fs * (60 / 42)));
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

  const cleanIbis = rawIbis.filter((ibi) => ibi <= medianIbiMs * 1.85 && ibi >= medianIbiMs * 0.45);
  const targetIbis = cleanIbis.length >= 2 ? cleanIbis : rawIbis;

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
  const prevFilter = options.prevFilter || { hp: 0.7, lp: 4.0, centerBpm: priorBpm, locked: false };

  // 1단계: 광대역(0.7~4.0Hz) 또는 수동 지정 대역으로 1차 스캔
  const initialHp = options.manualHp || 0.7;
  const initialLp = options.manualLp || 4.0;
  const wideFiltered = bandpassFilter(uniformSignal, fs, initialHp, initialLp);

  const wideFft = estimateBpmFFT(wideFiltered, fs);
  const wideAutocorr = estimateBpmAutocorr(wideFiltered, fs);
  const wideBeats = detectBeats(wideFiltered, fs);
  const wideRhythm = evaluateRhythm(wideBeats, durationSec, wideFft.bpm || priorBpm);

  // 5~10초 구간에서도 빠른 포착을 위해 자기상관 + IBI 중앙값 + FFT 교차 평가
  let candidateBpm = wideFft.bpm;
  let crossDiff = Math.abs(wideFft.bpm - wideAutocorr);

  if (durationSec < 10 && wideAutocorr > 42 && wideRhythm.medianBpm > 42) {
    // 5~10초 초기 구간: 시간 영역(자기상관 + 박동 간격 중앙값) 우선 결합
    if (Math.abs(wideAutocorr - wideRhythm.medianBpm) <= 12) {
      candidateBpm = (wideAutocorr + wideRhythm.medianBpm) / 2;
      crossDiff = Math.abs(wideAutocorr - wideRhythm.medianBpm);
    }
  }

  const rawQuality = Math.round(
    Math.min(100, Math.max(20, wideFft.confidence * 70 + (crossDiff <= 15 ? 30 : 10)))
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
      activeHp = Math.max(0.65, Number((priorHz - 0.45).toFixed(2)));
      activeLp = Math.min(3.8, Number((priorHz + 0.65).toFixed(2)));
      centerBpm = priorBpm;
      tuningMode = 'prior-fallback';
    } else if (candidateBpm >= 45 && candidateBpm <= 195) {
      // 신호 양호: 포착된 심박수 주파수(centerHz)를 따라 필터 대역폭 이동 (Continuous Adaptive Tracking)
      // 단, 이전 중심 BPM과 3 BPM 이상 차이 날 때만 갱신하여 스로틀링
      const targetBpm =
        prevFilter.locked && Math.abs(candidateBpm - prevFilter.centerBpm) < 3
          ? prevFilter.centerBpm
          : candidateBpm;
      const centerHz = targetBpm / 60;
      // 중첩파(dicrotic wave, 약 2배주파수 성분 일부) 보존 및 호흡(0.2~0.3Hz) 차단을 동시에 만족하는 비대칭 패스밴드
      activeHp = Math.max(0.65, Number((centerHz * 0.62).toFixed(2)));
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

  let finalBpm = fftRes.bpm;
  let isCrossValidated = Math.abs(fftRes.bpm - autocorrBpm) <= 15;

  if (!isCrossValidated && rhythm.medianBpm > 0) {
    if (Math.abs(rhythm.medianBpm - fftRes.bpm) <= 12) {
      finalBpm = (fftRes.bpm + rhythm.medianBpm) / 2;
      isCrossValidated = true;
    } else if (Math.abs(rhythm.medianBpm - autocorrBpm) <= 12) {
      finalBpm = (autocorrBpm + rhythm.medianBpm) / 2;
      isCrossValidated = true;
    } else {
      finalBpm = rhythm.medianBpm;
    }
  } else if (rhythm.medianBpm > 0 && Math.abs(rhythm.medianBpm - fftRes.bpm) <= 8) {
    finalBpm = fftRes.bpm * 0.65 + rhythm.medianBpm * 0.35;
  }

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
    filteredSignal: filtered,
    beatTimes,
    filterState: {
      hp: activeHp,
      lp: activeLp,
      centerBpm: roundedBpm,
      locked: qualityScore >= 50,
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