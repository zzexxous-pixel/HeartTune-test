/**
 * DSP 단위 테스트 — 합성 PPG 신호로 회귀 검증
 *
 * 실행: node --test tests/
 * (브라우저 없이 순수 JS로만 검증 가능하도록 src/dsp.js를 의존성 없이 구성)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bandpass,
  estimateBpm,
  autocorrBpm,
  detectBeats,
  analyzeRhythm,
  classifyBpm,
  assessQuality,
  nextPow2,
  fft,
  hann,
} from '../src/dsp.js';

const FS = 15; // 프로토타입 샘플링 주파수

/**
 * 합성 PPG 신호 생성.
 *
 * 한 주기 안에 수축기 피크 + 중첩파(dicrotic wave)를 **일부러** 포함시킨다.
 * 박동 검출기가 이 중첩파를 박동으로 오검출하는지 검증하는 것이
 * 이 테스트의 핵심 목적 중 하나다.
 *
 * @param {number} bpm
 * @param {number} sec 길이(초)
 * @param {{ibiJitter?:number, noise?:number, fs?:number, baseline?:number}} opts
 *   - ibiJitter: **박동 간격**의 상대 변동 (0.3 = ±30%). 부정맥 모사용.
 *     ⚠️ 샘플 단위 주파수 지터로 부정맥을 모사하면 안 된다. 위상 위주의
 *     랜덤 변화는 박동 간격을 거의 바꾸지 않아 cv가 0.05 수준에 머문다
 *     (초기 테스트의 오류). 반드시 IBI 자체를 흔들어야 한다.
 */
function synth(bpm, sec, { ibiJitter = 0, noise = 0, fs = FS, baseline = 120 } = {}) {
  const n = Math.round(sec * fs);
  const out = new Float64Array(n);
  const meanIbi = (60 / bpm) * fs; // 샘플 단위 평균 박동 간격

  // 1) 박동 시점을 먼저 만든다.
  //    ⚠️ 샘플 루프 안에서 매번 IBI를 새로 뽑으면 안 된다. 위상 누적 방식이라
  //    지터가 서로 상쇄되어 평균화되고, 실제 박동 간격은 거의 일정해진다.
  //    (실측: ibiJitter 0.5에서도 cv 0.09 → 부정맥 테스트가 영원히 실패)
  //    박동 간격을 "박동 단위"로 확정 지어야 진짜 IBI 변동이 생긴다.
  const beatTimes = [0];
  while (beatTimes[beatTimes.length - 1] < n) {
    const ibi = ibiJitter ? meanIbi * (1 + (Math.random() - 0.5) * 2 * ibiJitter) : meanIbi;
    beatTimes.push(beatTimes[beatTimes.length - 1] + Math.max(2, ibi));
  }

  // 2) 각 샘플이 어느 박동 주기에 속하는지 찾아 위상을 계산
  let bi = 0;
  for (let i = 0; i < n; i++) {
    while (bi + 2 < beatTimes.length && i >= beatTimes[bi + 1]) bi++;
    const start = beatTimes[bi];
    const period = Math.max(2, beatTimes[bi + 1] - beatTimes[bi]);
    const phase = (2 * Math.PI * (i - start)) / period;
    // 수축기 피크 + 중첩파 (실제 PPG 형태 모사)
    const s = Math.sin(phase) ** 3 + 0.4 * Math.sin(2 * phase);
    out[i] = baseline + s * 6 + (noise ? (Math.random() - 0.5) * 2 * noise : 0);
  }
  return out;
}

/* ---------------- 기본 유틸 ---------------- */

test('nextPow2', () => {
  assert.equal(nextPow2(1), 1);
  assert.equal(nextPow2(450), 512);
  assert.equal(nextPow2(512), 512);
  assert.equal(nextPow2(513), 1024);
});

test('fft: 단일 주파수 성분을 올바르게 찾는다', () => {
  const n = 64;
  const fs = 64;
  const target = 8; // Hz
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * target * i) / fs);
  fft(re, im);
  let peak = 0;
  let peakIdx = 0;
  for (let i = 1; i < n / 2; i++) {
    const mag = Math.hypot(re[i], im[i]);
    if (mag > peak) {
      peak = mag;
      peakIdx = i;
    }
  }
  assert.equal(peakIdx, target);
});

test('hann: 양 끝은 0, 가운데는 1', () => {
  const w = hann(9);
  assert.ok(Math.abs(w[0]) < 1e-9);
  assert.ok(Math.abs(w[8]) < 1e-9);
  assert.ok(Math.abs(w[4] - 1) < 1e-6);
});

/* ---------------- 대역통과 필터 ---------------- */

test('bandpass: 0.1Hz 움직임 성분을 제거한다', () => {
  const fs = 30;
  const n = fs * 30;
  const drift = new Float64Array(n);
  for (let i = 0; i < n; i++) drift[i] = 100 + 30 * Math.sin((2 * Math.PI * 0.1 * i) / fs);
  const filtered = bandpass(drift, fs);
  let max = -Infinity;
  for (const v of filtered) max = Math.max(max, Math.abs(v));
  // 입력 진폭 30 → 필터 후 크게 감쇠해야 함
  assert.ok(max < 3, `0.1Hz 성분이 남아있음 (max=${max})`);
});

test('bandpass: 1.2Hz(72bpm) 심장 성분은 보존한다', () => {
  const fs = 30;
  const n = fs * 30;
  const sig = new Float64Array(n);
  for (let i = 0; i < n; i++) sig[i] = 100 + 8 * Math.sin((2 * Math.PI * 1.2 * i) / fs);
  const filtered = bandpass(sig, fs);
  let max = 0;
  for (const v of filtered) max = Math.max(max, Math.abs(v));
  assert.ok(max > 3, `1.2Hz 성분이 사라짐 (max=${max})`);
});

/* ---------------- 심박수 추정 ---------------- */

test('estimateBpm: 72 BPM 신호 → ±3 이내', () => {
  const sig = synth(72, 30);
  const { bpm } = estimateBpm(sig, FS);
  assert.ok(Math.abs(bpm - 72) <= 3, `기대 72, 실제 ${bpm}`);
});

test('estimateBpm: 55 / 90 / 130 BPM 각각 ±4 이내', () => {
  for (const target of [55, 90, 130]) {
    const { bpm } = estimateBpm(synth(target, 30), FS);
    assert.ok(Math.abs(bpm - target) <= 4, `${target}bpm 기대, 실제 ${bpm}`);
  }
});

test('estimateBpm: 노이즈가 있어도 추정한다 (72bpm + noise 1.5)', () => {
  const { bpm } = estimateBpm(synth(72, 30, { noise: 1.5 }), FS);
  assert.ok(Math.abs(bpm - 72) <= 6, `기대 72±6, 실제 ${bpm}`);
});

test('estimateBpm: 15초 구간도 동작한다 (실시간 표시용)', () => {
  const { bpm } = estimateBpm(synth(78, 15), FS);
  assert.ok(Math.abs(bpm - 78) <= 6, `기대 78±6, 실제 ${bpm}`);
});

test('estimateBpm: 신호가 너무 짧으면 0을 반환', () => {
  const { bpm } = estimateBpm(synth(72, 1), FS);
  assert.equal(bpm, 0);
});

test('autocorrBpm: FFT 결과와 같은 값을 낸다 (교차 검증)', () => {
  const sig = synth(84, 30);
  const a = estimateBpm(sig, FS).bpm;
  const b = autocorrBpm(sig, FS);
  assert.ok(Math.abs(a - b) <= 5, `FFT ${a} vs autocorr ${b}`);
});

/* ---------------- 박동 검출 & 리듬 ---------------- */

test('detectBeats: 30초·72bpm → 30~42개 박동 검출', () => {
  const sig = bandpass(synth(72, 30), FS);
  const beats = detectBeats(sig, FS);
  const expected = 30 * (72 / 60);
  assert.ok(
    beats.length >= expected * 0.8 && beats.length <= expected * 1.2,
    `기대 약 ${expected}개, 실제 ${beats.length}개`,
  );
});

test('detectBeats: 중첩파(dicrotic)를 박동으로 오검출하지 않는다', () => {
  // 이 테스트가 실패하면 박동 수가 약 2배로 부푼다.
  // 과거 버그: ① 제곱 포락선이 음의 골짜기를 박동으로 인식
  //            ② 중앙값 기반 임계값이 중첩파를 통과시킴
  for (const bpm of [50, 72, 100]) {
    const beats = detectBeats(bandpass(synth(bpm, 30), FS), FS);
    const expected = (30 * bpm) / 60;
    assert.ok(
      Math.abs(beats.length - expected) <= Math.max(2, expected * 0.15),
      `${bpm}bpm: 기대 ${expected.toFixed(0)}개, 실제 ${beats.length}개 (중첩파 오검출 의심)`,
    );
  }
});

test('detectBeats: 45~140bpm 전 구간에서 박동 수가 실제와 일치', () => {
  const failures = [];
  for (const bpm of [45, 50, 55, 60, 66, 72, 80, 90, 100, 110, 120, 130, 140]) {
    const beats = detectBeats(bandpass(synth(bpm, 30), FS), FS);
    const expected = (30 * bpm) / 60;
    if (Math.abs(beats.length - expected) > Math.max(2, expected * 0.15)) {
      failures.push(`${bpm}bpm: ${beats.length}/${expected.toFixed(0)}`);
    }
  }
  assert.deepEqual(failures, [], `실패 구간: ${failures.join(', ')}`);
});

test('detectBeats: 노이즈가 있어도 박동 수를 유지', () => {
  const beats = detectBeats(bandpass(synth(72, 30, { noise: 1.5 }), FS), FS);
  assert.ok(Math.abs(beats.length - 36) <= 5, `기대 36±5, 실제 ${beats.length}`);
});

test('analyzeRhythm: 규칙적 신호는 irregular=false', () => {
  const sig = bandpass(synth(72, 30), FS);
  const beats = detectBeats(sig, FS);
  const r = analyzeRhythm(beats, FS, { durationSec: 30 });
  assert.ok(r.reliable, `박동 ${r.count}개로 신뢰 판단 불가`);
  assert.equal(r.irregular, false, `cv=${r.cv.toFixed(3)} 로 오검출`);
  assert.ok(r.cv < 0.08, `규칙적 신호의 cv가 너무 큼: ${r.cv.toFixed(3)}`);
});

test('analyzeRhythm: IBI가 흔들리는 신호는 irregular=true', () => {
  // 박동 간격 자체를 흔든다 (샘플 주파수 지터로는 부정맥이 모사되지 않음).
  // ±40%로 넉넉히 잡는 이유: ±30%면 cv가 0.143~0.154로 임계값 0.14에 붙어
  // 랜덤 시드에 따라 통과/실패가 갈리는 flaky 테스트가 된다.
  const sig = bandpass(synth(72, 30, { ibiJitter: 0.4 }), FS);
  const beats = detectBeats(sig, FS);
  const r = analyzeRhythm(beats, FS, { durationSec: 30 });
  assert.ok(r.count >= 8, `박동 수 부족 (${r.count})`);
  assert.ok(r.cv > 0.16, `cv=${r.cv.toFixed(3)} — 부정맥 신호인데 변동성이 너무 작음`);
  assert.equal(r.irregular, true, `cv=${r.cv.toFixed(3)} 인데 정상으로 판정됨`);
});

test('analyzeRhythm: 박동이 4개 미만이면 reliable=false', () => {
  const r = analyzeRhythm([10, 25, 40], FS, { durationSec: 30 });
  assert.equal(r.reliable, false);
  assert.equal(r.irregular, false);
});

/* ---------------- 판정 & 품질 ---------------- */

test('classifyBpm: 경계값 포함', () => {
  assert.equal(classifyBpm(45), 'brady');
  assert.equal(classifyBpm(59), 'brady');
  assert.equal(classifyBpm(60), 'normal');
  assert.equal(classifyBpm(100), 'normal');
  assert.equal(classifyBpm(101), 'tachy');
  assert.equal(classifyBpm(150), 'tachy');
});

test('assessQuality: 접촉 없음 / 과노출 / 정상', () => {
  const raw = Array.from(synth(72, 5));
  assert.equal(assessQuality(5, raw, FS).reason, 'noContact');
  assert.equal(assessQuality(255, raw, FS).reason, 'tooBright');
  assert.equal(assessQuality(120, raw, FS).ok, true);
  assert.equal(assessQuality(120, [], FS).reason, 'tooShort');
});
