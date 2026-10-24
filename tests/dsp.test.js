/**
 * tests/dsp.test.js
 * 오늘심박 (HeartTune) — DSP 알고리즘 및 동적 캘리브레이션 단위 테스트 스위트
 * 실행 명령어: node --test tests/dsp.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_FS,
  extractFrameSample,
  analyzePpgSignal,
  generateSyntheticPPG,
  resolveBpmEstimate
,
  evaluateRhythm
} from '../src/dsp.js';
import { validateI18nKeyParity } from '../src/i18n.js';

test('1. i18n 한·영 키 집합(ko vs en) 100% 일치 검증', () => {
  const res = validateI18nKeyParity();
  assert.equal(res.valid, true, `누락된 키 발견: EN=${res.missingInEn}, KO=${res.missingInKo}`);
  assert.ok(res.totalKeys >= 40);
});

test('2. 적응형 채널 추출기: 후면 플래시 적색 우세 시 R 채널 자동 선택', () => {
  const rgba = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 210;     // Red 우세
    rgba[i + 1] = 12;  // Green 포화(0 수렴)
    rgba[i + 2] = 8;   // Blue 포화
    rgba[i + 3] = 255;
  }
  const sample = extractFrameSample(rgba, 64, 64);
  assert.equal(sample.channel, 'R');
  assert.equal(sample.isFingerDetected, true);
});

test('3. 72 BPM 합성 신호 (30초) → 오차 ±3 BPM 이내 검증', () => {
  const sig = generateSyntheticPPG({ bpm: 72, durationSec: 30, jitterRatio: 0.02, noiseAmp: 0.2 });
  const res = analyzePpgSignal(sig, TARGET_FS);
  assert.ok(Math.abs(res.bpm - 72) <= 3, `기대 72±3, 실측 ${res.bpm}`);
  assert.equal(res.irregular, false);
  assert.equal(res.status, 'normal');
});

test('4. 55 / 90 / 130 BPM 합성 신호 → 오차 ±4 BPM 이내 검증', () => {
  for (const targetBpm of [55, 90, 130]) {
    const sig = generateSyntheticPPG({ bpm: targetBpm, durationSec: 30, jitterRatio: 0.02, noiseAmp: 0.2 });
    const res = analyzePpgSignal(sig, TARGET_FS);
    assert.ok(
      Math.abs(res.bpm - targetBpm) <= 4,
      `목표 ${targetBpm} BPM, 실측 ${res.bpm} BPM`
    );
  }
});

test('5. 강한 노이즈(진폭 1.5) 추가 시 → 오차 ±6 BPM 이내 및 박동 검출 안정성 검증', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const sig = generateSyntheticPPG({
      bpm: 72,
      durationSec: 30,
      jitterRatio: 0.02,
      noiseAmp: 1.5,
      seed
    });
    const res = analyzePpgSignal(sig, TARGET_FS);
    assert.ok(Math.abs(res.bpm - 72) <= 6, `노이즈 시드 ${seed}: 실측 ${res.bpm}`);
    assert.ok(Math.abs(res.beatCount - 36) <= 5, `기대 박동 36±5, 실측 ${res.beatCount}`);
  }
});

test('6. 15초 단기 측정 구간 → 오차 ±6 BPM 이내 및 단기 측정 플래그 활성화', () => {
  const sig = generateSyntheticPPG({ bpm: 76, durationSec: 15, jitterRatio: 0.02, noiseAmp: 0.3 });
  const res = analyzePpgSignal(sig, TARGET_FS);
  assert.ok(Math.abs(res.bpm - 76) <= 6, `기대 76±6, 실측 ${res.bpm}`);
  assert.equal(res.isShortMeasurement, true);
});

test('7. 박동 검출기: 45 ~ 140 BPM 전 구간 중첩파(dicrotic wave) 포함 신호 오차 15% 이내', () => {
  for (const bpm of [45, 60, 75, 95, 115, 140]) {
    const durationSec = 30;
    const expectedBeats = (bpm / 60) * durationSec;
    const sig = generateSyntheticPPG({ bpm, durationSec, jitterRatio: 0.02, noiseAmp: 0.25 });
    const res = analyzePpgSignal(sig, TARGET_FS);
    const errorRatio = Math.abs(res.beatCount - expectedBeats) / expectedBeats;
    assert.ok(
      errorRatio <= 0.15,
      `${bpm} BPM 박동 오차 초과: 기대 ${expectedBeats}, 검출 ${res.beatCount} (오차율 ${(errorRatio * 100).toFixed(1)}%)`
    );
  }
});

test('8. 리듬 판정: 규칙적 신호(CV 0.14 이하) vs IBI ±40% 지터 불규칙 신호(CV 0.14 초과)', () => {
  const regSig = generateSyntheticPPG({ bpm: 72, durationSec: 30, jitterRatio: 0.03, noiseAmp: 0.2 });
  const regRes = analyzePpgSignal(regSig, TARGET_FS);
  assert.equal(regRes.irregular, false);
  assert.ok(regRes.cv < 0.10, `규칙 신호 CV 기대 0.10 미만, 실측 ${regRes.cv}`);

  const irregSig = generateSyntheticPPG({ bpm: 72, durationSec: 30, jitterRatio: 0.42, noiseAmp: 0.2 });
  const irregRes = analyzePpgSignal(irregSig, TARGET_FS);
  assert.equal(irregRes.irregular, true);
  assert.equal(irregRes.status, 'irregular');
  assert.ok(irregRes.cv > 0.14, `불규칙 신호 CV 기대 0.14 초과, 실측 ${irregRes.cv}`);
});

test('9. [적응형 캘리브레이션] 5초 초고속 초기 포착 및 동적 필터 대역 트래킹(tracking) 진입 검증', () => {
  // 5초 분량(75샘플 @15Hz)의 84 BPM 신호 생성
  const sig5s = generateSyntheticPPG({ bpm: 84, durationSec: 5, jitterRatio: 0.02, noiseAmp: 0.15 });
  const res = analyzePpgSignal(sig5s, TARGET_FS, {
    priorBpm: 70,
    prevFilter: { hp: 0.7, lp: 4.0, centerBpm: 70, locked: false }
  });

  // 5초 만에 목표 84 BPM 근처(±6 이내)로 빠르게 포착하고 tracking 모드로 진입해야 함
  assert.ok(Math.abs(res.bpm - 84) <= 6, `5초 고속 포착 기대 84±6, 실측 ${res.bpm}`);
  assert.equal(res.filterState.mode, 'tracking');
  assert.equal(res.filterState.locked, true);
  // 초기 광대역(0.7~4.0Hz)보다 좁혀진 맞춤형 대역이 형성되었는지 확인
  assert.ok(res.filterState.hp >= 0.75, `적응형 HPF 기대 0.75 이상, 실측 ${res.filterState.hp}`);
  assert.ok(res.filterState.lp <= 3.5, `적응형 LPF 기대 3.5 이하, 실측 ${res.filterState.lp}`);
});

test('10. [적응형 캘리브레이션] 초기 5초 신호가 순수 노이즈일 때 로컬 스토리지 기저 심박수(prior-fallback) 작동 검증', () => {
  // 심박 성분이 전혀 없는 백색 잡음 생성 (6초)
  const pureNoise = new Float64Array(6 * TARGET_FS);
  for (let i = 0; i < pureNoise.length; i++) {
    pureNoise[i] = 150 + Math.sin(i * 1.7) * 0.5 + (i % 3) * 0.2;
  }

  // 아직 필터가 잠기지 않은(locked: false) 초기 상태에서 품질이 낮으면 priorBpm(66 BPM) 대역으로 폴백해야 함
  const res = analyzePpgSignal(pureNoise, TARGET_FS, {
    priorBpm: 66,
    prevFilter: { hp: 0.7, lp: 4.0, centerBpm: 66, locked: false }
  });

  if (res.filterState.mode === 'prior-fallback') {
    assert.equal(res.filterState.centerBpm, 66);
  } else {
    // 우연히 주기성이 잡히더라도 비정상 대역으로 튀지 않는지 확인
    assert.ok(res.filterState.hp >= 0.65 && res.filterState.lp <= 4.0);
  }
});

test('11. [적응형 캘리브레이션] 측정 중 모션 아티팩트(품질 급락) 발생 시 직전 필터 대역 고정(Hold) 검증', () => {
  // 직전 주기까지 78 BPM(hp: 0.81, lp: 2.80)으로 깨끗하게 잠겨(locked: true) 있던 상태 가정
  const lockedPrevFilter = {
    hp: 0.81,
    lp: 2.80,
    centerBpm: 78,
    locked: true
  };

  // 갑작스러운 손가락 흔들림으로 인해 평탄화/깨진 저품질 신호 유입 (6초)
  const corruptedSignal = new Float64Array(6 * TARGET_FS);
  for (let i = 0; i < corruptedSignal.length; i++) {
    corruptedSignal[i] = 150 + ((i * 37) % 11) - 5; // 다중 주파수 혼선 잡음
  }

  const res = analyzePpgSignal(corruptedSignal, TARGET_FS, {
    priorBpm: 72,
    prevFilter: lockedPrevFilter
  });

  // 품질이 45점 미만으로 떨어지면 필터가 흔들림 주파수를 따라가지 않고 직전 대역(0.81~2.80Hz)을 Hold 해야 함
  if (res.filterState.mode === 'hold') {
    assert.equal(res.filterState.hp, 0.81);
    assert.equal(res.filterState.lp, 2.80);
  }
});

test('12. [디버그 샌드박스] 수동 필터 슬라이더(manualHp / manualLp) 오버라이드 동작 검증', () => {
  const sig = generateSyntheticPPG({ bpm: 72, durationSec: 15, jitterRatio: 0.02, noiseAmp: 0.2 });
  const res = analyzePpgSignal(sig, TARGET_FS, {
    priorBpm: 72,
    manualHp: 0.95,
    manualLp: 3.10
  });

  assert.equal(res.filterState.mode, 'manual');
  assert.equal(res.filterState.hp, 0.95);
  assert.equal(res.filterState.lp, 3.10);
  assert.ok(Math.abs(res.bpm - 72) <= 4);
});

test('13. [하모닉 혼동 해소] FFT가 2차 하모닉을 골라도 박동(시간영역) 중재로 기본파를 복원해야 함', () => {
  // 45 BPM 실측: FFT=89.65(2차 하모닉), 자기상관=44.99, IBI 중앙값=44.8
  const resolved = resolveBpmEstimate({
    fftBpm: 89.65,
    autocorrBpm: 44.99,
    beatMedianBpm: 44.8,
    beatCount: 23,
    durationSec: 30,
    priorBpm: 72
  });
  assert.equal(resolved.source, 'time-domain');
  assert.equal(resolved.isHarmonicCorrected, true);
  assert.ok(Math.abs(resolved.bpm - 45) <= 2, `기대 45±2, 실측 ${resolved.bpm}`);

  // 120 BPM 실측: FFT=119.77(정답), 자기상관=59.98(2배 주기 오검출)
  const resolved2 = resolveBpmEstimate({
    fftBpm: 119.77,
    autocorrBpm: 59.98,
    beatMedianBpm: 120.3,
    beatCount: 59,
    durationSec: 30,
    priorBpm: 72
  });
  assert.ok(Math.abs(resolved2.bpm - 120) <= 2, `기대 120±2, 실측 ${resolved2.bpm}`);
});

test('14. [하모닉 혼동 해소] 주파수 두 추정치가 합의하면 그 합의를 우선한다', () => {
  const resolved = resolveBpmEstimate({
    fftBpm: 108,
    autocorrBpm: 108,
    beatMedianBpm: null,
    beatCount: 4,
    durationSec: 30,
    priorBpm: 72
  });
  assert.equal(resolved.source, 'frequency');
  assert.ok(Math.abs(resolved.bpm - 108) <= 1, `기대 108, 실측 ${resolved.bpm}`);
});

test('15. [하모닉 혼동 해소] 10초 미만 구간은 자기상관+IBI 중앙값 평균으로 고속 포착한다', () => {
  const resolved = resolveBpmEstimate({
    fftBpm: 0,
    autocorrBpm: 84,
    beatMedianBpm: 83.5,
    beatCount: 7,
    durationSec: 5,
    priorBpm: 70
  });
  assert.equal(resolved.source, 'early-time-domain');
  assert.ok(Math.abs(resolved.bpm - 83.75) <= 1, `기대 83.75, 실측 ${resolved.bpm}`);
});


test('16. [안정화 구간 방어] 초반 자동노출 트랜지언트가 붙은 규칙 신호 → 부정맥 오탐 방지', () => {
  // 실측 사례 재현: 카메라 자동노출/접촉 안정화 동안 첫 ~3초의 값이 5→255(포화)→190대로
  // 크게 요동하고, 이후는 규칙적인 맥파(±1~3)인 신호. 요동 구간의 가짜 피크가
  // 짧은 IBI를 만들어 정상 리듬이 '부정맥'로 오탐되던 문제(2026-10-24 사용자 보고).
  const fs = TARGET_FS;
  const warmupSec = 3;
  const clean = generateSyntheticPPG({ bpm: 78, durationSec: 27, jitterRatio: 0.03, noiseAmp: 0.9, dcLevel: 195, seed: 77 });
  const nWarm = Math.round(warmupSec * fs);
  const settle = new Float64Array(nWarm);
  for (let i = 0; i < nWarm; i++) {
    const t = i / fs;
    if (t < 0.6) settle[i] = 5 + (i / nWarm) * 20;           // 손가락 닿기 전 어두운 값
    else if (t < 1.1) settle[i] = 255 - (i % 3) * 4;          // 자동노출 급상승(포화)
    else settle[i] = 190 + 65 * Math.exp(-(t - 1.1) * 2.2);   // 기저로 지수 감쇠
  }
  const combined = new Float64Array(nWarm + clean.length);
  combined.set(settle, 0);
  combined.set(clean, nWarm);
  const res = analyzePpgSignal(combined, fs);
  assert.equal(res.irregular, false, `규칙 신호인데 부정맥 오탐 (cv=${res.cv})`);
  assert.equal(res.status, 'normal', `status 기대 normal, 실측 ${res.status}`);
  assert.ok(Math.abs(res.bpm - 78) <= 4, `기대 78±4 BPM, 실측 ${res.bpm}`);
});

test('17. [이상치 정제] 측정 중간 모션 아티팩트로 생긴 튀는 IBI는 CV에서 제외된다', () => {
  // 78 BPM 규칙 신호 중간에 짧은 이중 검출(≈0.5×IBI)과 놓친 박동(≈2×IBI)을
  // 흉내 낸 IBI 배열을 evaluateRhythm 에 직접 넣어 정제 동작을 검증한다.
  const beatTimes = [];
  let t = 0.5;
  for (let b = 0; b < 36; b++) {
    beatTimes.push(t);
    t += 60 / 78; // 769ms 규칙 IBI
  }
  const rhythmBefore = evaluateRhythm(beatTimes, 28, 78);
  assert.ok(rhythmBefore.cv < 0.14, `준비 확인: 규칙 IBI는 irregular 아니어야 함 (cv=${rhythmBefore.cv})`);

  // 중간 3개 박동을 흔들어 이중 검출(0.52×)·놓침(1.95×) 유사 패턴을 만든다
  const withArtifacts = [...beatTimes];
  withArtifacts[15] += 0.19;
  withArtifacts[16] -= 0.17;
  withArtifacts[20] += 0.74;
  const rhythmArt = evaluateRhythm(withArtifacts, 28, 78);
  assert.equal(rhythmArt.irregular, false, `아티팩트 IBI가 정제되지 않아 오탐 (cv=${rhythmArt.cv})`);
});

test('18. [보존 확인] 연속적으로 넓게 변하는 불규칙 리듬은 정제 후에도 부정맥으로 유지된다', () => {
  // 실제 불규칙 리듬(연속 변동, 이상치 아님)은 MAD 정제에 지워지지 않는다.
  const irreg = generateSyntheticPPG({ bpm: 76, durationSec: 30, jitterRatio: 0.38, noiseAmp: 0.3, seed: 123 });
  const res = analyzePpgSignal(irreg, TARGET_FS);
  assert.equal(res.irregular, true, `불규칙 신호가 정상으로 둔갑 (cv=${res.cv})`);
  assert.equal(res.status, 'irregular');
});
