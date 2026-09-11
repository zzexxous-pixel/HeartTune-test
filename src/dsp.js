/**
 * DSP — PPG 신호 처리
 *
 * 손가락 PPG(광용적맥파) 시계열에서 심박수와 리듬 변동성을 뽑는다.
 * 순수 함수만으로 구성해 브라우저 없이도 node --test로 검증할 수 있게 했다.
 */

/* ------------------------------------------------------------------ *
 * Butterworth 대역통과 필터 (2차 × 2단 = 4차)
 * ------------------------------------------------------------------ */

/**
 * 아날로그 프로토타입 → 쌍선형 변환(bilinear transform)으로 2차 Butterworth 설계.
 * @param {'lowpass'|'highpass'} type
 * @param {number} fc 차단 주파수(Hz)
 * @param {number} fs 샘플링 주파수(Hz)
 * @returns {{b:number[], a:number[]}}
 */
function butter2(type, fc, fs) {
  // 주파수 사전 왜곡(pre-warping)
  const wc = Math.tan((Math.PI * fc) / fs);
  const wc2 = wc * wc;
  const sqrt2 = Math.SQRT2;

  let b, a;
  if (type === 'lowpass') {
    // H(s) = 1 / (s^2 + sqrt2 s + 1)
    const norm = 1 / (1 + sqrt2 * wc + wc2);
    b = [wc2 * norm, 2 * wc2 * norm, wc2 * norm];
    a = [1, (2 * (wc2 - 1)) * norm, (1 - sqrt2 * wc + wc2) * norm];
  } else {
    // H(s) = s^2 / (s^2 + sqrt2 s + 1)
    const norm = 1 / (1 + sqrt2 * wc + wc2);
    b = [norm, -2 * norm, norm];
    a = [1, (2 * (wc2 - 1)) * norm, (1 - sqrt2 * wc + wc2) * norm];
  }
  return { b, a };
}

/** Direct Form I 바이쿼드 필터링. */
function biquad(signal, { b, a }) {
  const out = new Float64Array(signal.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/**
 * 4차 Butterworth 대역통과. 저주파(호흡·움직임)와 고주파 노이즈를 함께 제거.
 *
 * ⚠️ 필터링 전에 반드시 평균을 제거한다. PPG 원신호는 0~255 레벨의 DC를
 *    포함하는데, 이걸 그대로 highpass에 넣으면 필터 천이(transient)가
 *    수 초간 지속되어 이후 박동 검출 임계값까지 오염시킨다.
 *
 * @param {number[]|Float64Array} signal
 * @param {number} fs 샘플링 주파수(Hz)
 * @param {number} lo 하한(Hz) — 기본 0.7 (= 42 BPM)
 * @param {number} hi 상한(Hz) — 기본 4.0 (= 240 BPM)
 */
export function bandpass(signal, fs, lo = 0.7, hi = 4.0) {
  const n = signal.length;
  const hp = butter2('highpass', lo, fs);
  const lp = butter2('lowpass', hi, fs);

  // 1) DC 제거
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;
  const centered = new Float64Array(n);
  for (let i = 0; i < n; i++) centered[i] = signal[i] - mean;

  // 2) forward-backward(zerophase) — 위상 왜곡 없이 진폭 특성만 정제
  const pass = (input) => biquad(biquad(input, hp), lp);
  const fwd = pass(centered);
  const rev = new Float64Array(n);
  for (let i = 0; i < n; i++) rev[i] = fwd[n - 1 - i];
  const back = pass(rev);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = back[n - 1 - i];
  return out;
}

/* ------------------------------------------------------------------ *
 * FFT (반복형 radix-2)
 * ------------------------------------------------------------------ */

export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * 제자리(in-place) FFT. re/im 길이는 2의 거듭제곱이어야 한다.
 */
export function fft(re, im) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT 길이는 2의 거듭제곱이어야 합니다');

  // 비트 반전 재배열
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** 한닝 창. 스펙트럼 누설을 줄인다. */
export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/* ------------------------------------------------------------------ *
 * 심박수 추정
 * ------------------------------------------------------------------ */

/**
 * 스펙트럼 피크에서 BPM 추정. 부포물선 보간으로 빈 해상도 이하 정밀도를 확보.
 * @returns {{bpm:number, power:number, spectrum:Float64Array, freqs:Float64Array}}
 */
export function estimateBpm(rawSignal, fs, { loBpm = 42, hiBpm = 200 } = {}) {
  if (rawSignal.length < fs * 2) {
    return { bpm: 0, power: 0, spectrum: new Float64Array(0), freqs: new Float64Array(0) };
  }

  const n = nextPow2(rawSignal.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const win = hann(rawSignal.length);

  let mean = 0;
  for (let i = 0; i < rawSignal.length; i++) mean += rawSignal[i];
  mean /= rawSignal.length;

  for (let i = 0; i < rawSignal.length; i++) re[i] = (rawSignal[i] - mean) * win[i];

  fft(re, im);

  const half = n >> 1;
  const spectrum = new Float64Array(half);
  const freqs = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    spectrum[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / rawSignal.length;
    freqs[i] = (i * fs) / n;
  }

  const loHz = loBpm / 60;
  const hiHz = hiBpm / 60;
  let peak = -1;
  let peakIdx = -1;
  for (let i = 1; i < half; i++) {
    if (freqs[i] < loHz || freqs[i] > hiHz) continue;
    if (spectrum[i] > peak) {
      peak = spectrum[i];
      peakIdx = i;
    }
  }
  if (peakIdx < 0) return { bpm: 0, power: 0, spectrum, freqs };

  // 부포물선 보간
  let refined = freqs[peakIdx];
  if (peakIdx > 0 && peakIdx < half - 1) {
    const a = spectrum[peakIdx - 1];
    const b = spectrum[peakIdx];
    const c = spectrum[peakIdx + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) {
      const delta = (0.5 * (a - c)) / denom;
      refined = freqs[peakIdx] + (delta * fs) / n;
    }
  }

  return { bpm: Math.round(refined * 60), power: peak, spectrum, freqs };
}

/**
 * 자기상관 기반 BPM 추정 (FFT와 교차 검증용).
 * @returns {number} bpm (실패 시 0)
 */
export function autocorrBpm(rawSignal, fs, { loBpm = 42, hiBpm = 200 } = {}) {
  const n = rawSignal.length;
  if (n < fs * 2) return 0;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += rawSignal[i];
  mean /= n;

  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = rawSignal[i] - mean;

  const minLag = Math.floor((60 / hiBpm) * fs);
  const maxLag = Math.ceil((60 / loBpm) * fs);

  let best = -Infinity;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
    sum /= n - lag;
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return bestLag > 0 ? Math.round((60 * fs) / bestLag) : 0;
}

/* ------------------------------------------------------------------ *
 * 리듬(부정맥) 분석
 * ------------------------------------------------------------------ */

/** 이동평균으로 완만한 기저선을 제거한다. */
export function detrend(signal, windowSec, fs) {
  const w = Math.max(3, Math.round(windowSec * fs));
  const out = new Float64Array(signal.length);
  let sum = 0;
  for (let i = 0; i < signal.length; i++) {
    sum += signal[i];
    if (i >= w) sum -= signal[i - w];
    const count = Math.min(i + 1, w);
    out[i] = signal[i] - sum / count;
  }
  return out;
}

/**
 * 박동 위치 검출.
 *
 * 방식: 제곱 포락선 → 평활 → 후보 피크 수집 → **돌출도 기반 탐욕 선택**
 *
 * ⚠️ 두 가지 주의 (초기 구현에서 둘 다 실제로 발생했다)
 *  1. 임계값에 `최대값`을 쓰면 모션 아티팩트 한두 개가 최댓값을 끌어올려
 *     실제 박동이 전부 묻힌다 → 평균·표준편차 기반 사용.
 *  2. PPG는 한 주기 안에 **수축기 피크 + 중첩파(dicrotic wave)** 두 개의
 *     극대값이 있다. 단순 "최소간격 + 임계값"으로는 둘 다 세서 박동 수가
 *     2배가 된다(측정 71개 vs 실제 36개). 평활을 늘려 합치는 방식은
 *     고심박수에서 실제 박동까지 합쳐버리므로 부적합.
 *     → **큰 피크부터 먼저 선점**하는 탐욕 선택으로 해결. 수축기 피크가
 *       중첩파보다 항상 크므로 심박수와 무관하게 정상 동작한다.
 *
 * @param {number[]|Float64Array} signal 대역통과된 신호
 * @param {number} fs 샘플링 주파수
 * @returns {number[]} 박동 인덱스 배열 (시간순)
 */
export function detectBeats(signal, fs, { minGapSec = 0.28, smoothSec = 0.15 } = {}) {
  const n = signal.length;
  if (n < fs) return [];

  // 1) 양극 포락선 — 음의 골짜기는 0으로 클램프
  //    ⚠️ 제곱(signal²)이나 절대값(|signal|)을 쓰면 안 된다.
  //    PPG는 수축기 피크 직후 골짜기가 깊이 파이는데, 부호를 없애면
  //    골짜기가 박동으로 잡힌다.
  //    (실측 50bpm: 수축기 4.3 vs 골짜기 4.9 → 골짜기가 더 커서 박동 2배 검출)
  //    대역통과된 신호는 0 중심이므로 **양극 로컬맥스만이 수축기**다.
  const sq = new Float64Array(n);
  for (let i = 0; i < n; i++) sq[i] = signal[i] > 0 ? signal[i] : 0;

  // 2) 짧은 이동평균 평활 (고주파 노이즈로 인한 가짜 후보 억제)
  //    저프레임레이트(15fps)에서도 창이 최소 3샘플은 되도록 보장
  const w = Math.max(3, Math.round(smoothSec * fs));
  const env = new Float64Array(n);
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += sq[i];
    if (i >= w) run -= sq[i - w];
    env[i] = run / Math.min(i + 1, w);
  }

  // 3) 로컬 피크 후보 수집
  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (env[i] >= env[i - 1] && env[i] > env[i + 1]) candidates.push(i);
  }
  if (candidates.length === 0) return [];

  // 4) 임계값: **상위 피크 높이(90백분위)의 35%**
  //    ⚠️ 중앙값 기준으로 잡으면 안 된다. 피크 대부분이 수축기고 중첩파가
  //    소수라 중앙값이 낮게 잡혀 중첩파가 임계값을 근소하게 통과한다
  //    (실측: 중앙값 10.2 → floor 2.5, 중첩파 2.6~2.9 통과 → 박동 2배 부풀림).
  //    상위 피크 = 수축기이므로 그 비율로 잡으면 심박수와 무관하게 분리된다.
  const heights = candidates.map((i) => env[i]).sort((a, b) => a - b);
  const p90 = heights[Math.min(heights.length - 1, Math.floor(heights.length * 0.9))];
  const floor = p90 * 0.35;
  const kept = candidates.filter((i) => env[i] >= floor);
  if (kept.length === 0) return [];

  // 5) 돌출도 기반 탐욕 선택 — 큰 피크가 먼저 자리를 선점한다
  const minGap = Math.max(1, Math.round(minGapSec * fs));
  const chosen = [];
  const taken = new Uint8Array(n);
  const byHeight = kept.slice().sort((a, b) => env[b] - env[a]);

  for (const idx of byHeight) {
    let blocked = false;
    for (let i = Math.max(0, idx - minGap); i <= Math.min(n - 1, idx + minGap); i++) {
      if (taken[i]) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    taken[idx] = 1;
    chosen.push(idx);
  }
  chosen.sort((a, b) => a - b);

  // 6) 포락선 평활로 치우친 위치를 원신호 극대 위치로 보정
  const refine = Math.max(1, Math.round(0.1 * fs));
  const seen = new Set();
  const out = [];
  for (const p of chosen) {
    let best = p;
    let bestVal = -Infinity;
    for (let i = Math.max(0, p - refine); i <= Math.min(n - 1, p + refine); i++) {
      if (signal[i] > bestVal) {
        bestVal = signal[i];
        best = i;
      }
    }
    if (!seen.has(best)) {
      seen.add(best);
      out.push(best);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * 박동 간격(IBI) 변동성으로 리듬 규칙성을 평가한다.
 *
 * ⚠️ 임계값은 잠정값이다. 카메라 PPG는 모션 아티팩트에 민감해
 *    실제 부정맥과 흔들림을 구분하지 못할 수 있다 → 임상 검증 필요.
 *
 * @returns {{count:number, cv:number, rmssdMs:number, irregular:boolean, reliable:boolean}}
 */
export function analyzeRhythm(beats, fs, { durationSec = 30, cvThreshold = 0.14 } = {}) {
  if (beats.length < 4) {
    return { count: beats.length, cv: 0, rmssdMs: 0, irregular: false, reliable: false };
  }

  const ibi = [];
  for (let i = 1; i < beats.length; i++) ibi.push((beats[i] - beats[i - 1]) / fs);

  const mean = ibi.reduce((s, v) => s + v, 0) / ibi.length;
  const variance = ibi.reduce((s, v) => s + (v - mean) ** 2, 0) / ibi.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  let rmss = 0;
  for (let i = 1; i < ibi.length; i++) rmss += (ibi[i] - ibi[i - 1]) ** 2;
  const rmssdMs = Math.sqrt(rmss / (ibi.length - 1)) * 1000;

  // 박동이 충분히 많아야 신뢰할 수 있다 (30초·70bpm이면 약 35개)
  const expectedBeats = (durationSec * 60) / 1000;
  const reliable = beats.length >= Math.max(8, expectedBeats * 0.4);

  return { count: beats.length, cv, rmssdMs, irregular: reliable && cv > cvThreshold, reliable };
}

/* ------------------------------------------------------------------ *
 * 신호 품질 평가
 * ------------------------------------------------------------------ */

/**
 * 손가락 접촉·흔들림을 품질로 환산한다.
 * @param {number} meanLevel 녹색채널 평균 (0~255) — 접촉 여부 판단
 * @param {number[]} raw 최근 원시 신호
 * @param {number} fs
 */
export function assessQuality(meanLevel, raw, fs) {
  if (meanLevel < 20) return { ok: false, reason: 'noContact', score: 0 };
  if (meanLevel > 250) return { ok: false, reason: 'tooBright', score: 0 };
  if (!raw || raw.length < fs) return { ok: false, reason: 'tooShort', score: 0 };

  // 고주파 성분(손떨림) 비율로 안정성 판단
  const diff = [];
  for (let i = 1; i < raw.length; i++) diff.push(Math.abs(raw[i] - raw[i - 1]));
  const jitter = diff.reduce((s, v) => s + v, 0) / diff.length;

  let range = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  range = max - min;
  if (range < 0.5) return { ok: false, reason: 'noContact', score: 0 };

  const score = Math.max(0, Math.min(1, range / 8 - jitter / 6));
  if (score < 0.25) return { ok: false, reason: 'holdStill', score };
  return { ok: true, reason: null, score };
}

/**
 * 심박수를 판정 문구 키로 변환한다.
 * @returns {'brady'|'normal'|'tachy'}
 */
export function classifyBpm(bpm) {
  if (bpm < 60) return 'brady';
  if (bpm > 100) return 'tachy';
  return 'normal';
}
