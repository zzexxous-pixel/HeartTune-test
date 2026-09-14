/**
 * 오늘심박 (HeartTune) — 진입점
 *
 * 측정 흐름 (2026-09-11 UX 개편)
 *   시작 화면    ──측정 시작──▶  준비: 카메라 ON · 플래시 OFF · 접촉 확인 링
 *     접촉 감지 1.2초 지속 ──▶  3·2·1 카운트다운
 *     카운트다운 완료    ──▶  플래시 ON + 측정 개시
 *   0 ~ 15초     신호 수집 + 품질 체크 (BPM 미표시 — 초기 튀는 값 방지)
 *   15초         첫 BPM 표시
 *   이후 5초마다  슬라이딩 윈도 FFT로 BPM 갱신 (지루함 방지)
 *   손가락 이탈   0.8초 지속 시 일시정지(타이머 포함), 재접촉 0.8초 후 이어서 진행
 *   측정 종료    최종 BPM 확정 + 리듬(부정맥) 판정 1회
 *
 * 파형 표시 (2026-09-11 개편)
 *   - 매 프레임 원시값을 그리면 지터가 심하므로, 분석과 같은
 *     "15Hz 재표본화 + 대역통과 필터" 신호를 그린다 (표시용 3샘플 평활 추가)
 *   - x축은 항상 0초~경과 시간: 측정 초반엔 넓게, 진행될수록 전체가 압축된다
 *
 * 광원 정책 (main의 화면조명 수정과 통합)
 *   - 플래시는 측정 개시 순간에만 점화. 준비 단계에서는 끄고 있다.
 *   - 플래시 미지원 기기라도 전체화면 흰 오버레이는 절대 자동으로 켜지 않는다
 *     (전체화면 오버레이는 UI를 가려 "고장"으로 보인다는 실사용 사고 반영).
 *     대신 "밝은 곳에서 측정" 안내를 보여주고, 전면 카메라 기기는
 *     사용자 토글로 상단 조명 스트립을 켤 수 있다.
 */

import { initI18n, t, applyI18n, getLanguage, formatDateTime } from './i18n/index.js';
import { Camera, startSampling, resample } from './camera.js';
import { bandpass, estimateBpm, autocorrBpm, detectBeats, analyzeRhythm, classifyBpm, assessQuality } from './dsp.js';
import { loadHistory, addHistory, clearHistory, recentForChart } from './storage.js';
import { renderResultImage } from './share.js';

const FS = 15; // 분석용 샘플링률(Hz) — 재표본화 목표
const LIVE_FROM_SEC = 15; // 실시간 BPM 표시 시작
const LIVE_STEP_SEC = 5; // 갱신 주기
const MIN_SEC_FOR_RHYTHM = 30; // 이보다 짧으면 리듬 판정을 '참고'로 강등

/* --- 준비 단계 (접촉 감지 → 자동 시작) --- */
const PREVIEW_CHECK_MS = 250; // 접촉 판정 주기
const PREVIEW_HOLD_MS = 1200; // 접촉이 이만큼 지속되면 카운트다운 시작
const COUNTDOWN_SEC = 3;
const CONTACT_DARK_MAX = 60; // 플래시 OFF에서 렌즈가 가려진 전형적인 녹색 평균 상한
const CONTACT_JITTER_MAX = 4; // 가려진 렌즈는 프레임 간 변동도 작다
const PULSE_SPEC_RATIO = 5; // 스펙트럼 피크가 중앙값의 이 배수면 맥동으로 인정
const MANUAL_START_AFTER_MS = 12000; // 감지 실패가 길어지면 수동 시작 버튼 노출

/* --- 이탈 → 일시정지 --- */
const PAUSE_ON_MS = 800; // 이탈이 이만큼 지속되면 일시정지
const RESUME_ON_MS = 800; // 재접촉이 이만큼 지속되면 재개

const WAVE_DRAW_INTERVAL_MS = 120; // 전체 파형 다시 그리는 주기 (스로틀)

const els = {};
let camera = null;
let stopSampling = null;

/** 'idle' | 'ready' | 'countdown' | 'measuring' | 'paused' */
let phase = 'idle';
let running = false;
let durationSec = 30;

/** @type {{t:number, green:number}[]} 측정 샘플 — t는 "측정 경과 ms" (일시정지 시 멈춘다) */
let samples = [];
let startTs = 0;
let pausedAt = 0; // 일시정지 진입 시각 (performance.now 기준)
let pauseIdx = 0; // 일시정지 직전까지의 샘플 수 — 재개 시 이후는 버린다
let nextLiveAt = LIVE_FROM_SEC;
let lastResult = null;
let notOkSince = 0;
let okSince = 0;
let lastWaveDraw = 0;

/** @type {{t:number, green:number}[]} 준비 단계 샘플 — t는 performance.now 기준 */
let previewSamples = [];
let readyStartTs = 0;
let contactSince = 0;
let pulseFlag = false;
let lastContactCheck = 0;
let lastPulseCheck = 0;
let countdownTimer = null;

/* ------------------------------------------------------------------ */
/* 초기화                                                              */
/* ------------------------------------------------------------------ */

function cacheEls() {
  const ids = [
    'langToggle', 'langLabel', 'btnStart', 'video', 'wave', 'liveBpm', 'statusText',
    'progressBar', 'remainingText', 'btnCancel', 'resultCard', 'resultBpm',
    'resultTitle', 'resultRhythm', 'resultDesc', 'resultMeta', 'btnSaveImage',
    'btnAgain', 'historyList', 'historyChart', 'btnClearHistory', 'toast',
    'tabBar', 'installBanner', 'btnInstallOk', 'btnInstallNo',
    'camError', 'camErrorText', 'camErrorUrl', 'btnOpenTab', 'btnRetryCam',
    'viewMeasuring', 'fingerRing', 'countdown', 'pauseOverlay', 'btnManualStart',
    'btnScreenLight',
  ];
  for (const id of ids) els[id] = document.getElementById(id);
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
  const target = document.getElementById(`view${name[0].toUpperCase()}${name.slice(1)}`);
  target?.classList.add('is-active');
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === name || (name === 'measuring' && tab.dataset.view === 'start'));
  });
  // 측정/결과 화면에서는 탭바를 숨겨 오터치를 막는다
  els.tabBar.style.display = name === 'start' || name === 'history' ? '' : 'none';
}

function toast(msg, ms = 2200) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

/* ------------------------------------------------------------------ */
/* 측정 — 준비 단계 (플래시 OFF, 접촉 감지)                             */
/* ------------------------------------------------------------------ */

async function startMeasurement() {
  if (running) return;
  running = true;
  phase = 'ready';
  samples = [];
  previewSamples = [];
  contactSince = 0;
  pulseFlag = false;
  lastContactCheck = 0;
  lastPulseCheck = 0;
  notOkSince = 0;
  okSince = 0;
  pausedAt = 0;
  pauseIdx = 0;
  lastWaveDraw = 0;

  showView('measuring');
  els.viewMeasuring.classList.add('is-ready');
  els.fingerRing.hidden = false;
  els.fingerRing.classList.remove('is-covered');
  els.countdown.hidden = true;
  els.pauseOverlay.hidden = true;
  els.btnManualStart.hidden = true;
  els.liveBpm.textContent = '--';
  els.statusText.textContent = t('measuring.ready');
  els.progressBar.style.width = '0%';

  try {
    els.camError.hidden = true;
    camera = new Camera(els.video);
    // ⚠️ 플래시는 켜지 않는다 — 카운트다운 후 측정 개시 시점에 점화
    await camera.start();
  } catch (e) {
    running = false;
    phase = 'idle';
    els.viewMeasuring.classList.remove('is-ready');
    els.fingerRing.hidden = true;
    showView('start');
    showCameraError(e.code ?? 'failed');
    return;
  }

  readyStartTs = performance.now();
  stopSampling?.();
  stopSampling = startSampling(camera, onPreviewSample);
}

/** 준비 단계 프레임 콜백 — 접촉 여부를 평가하고 자동 시작을 진행한다 */
function onPreviewSample(s) {
  if (phase !== 'ready' && phase !== 'countdown') return;
  previewSamples.push({ t: s.t, green: s.green });
  if (previewSamples.length > 600) previewSamples.splice(0, previewSamples.length - 600);

  const now = s.t;
  if (now - lastContactCheck < PREVIEW_CHECK_MS) return;
  lastContactCheck = now;

  // 맥동 검출(FFT)은 비용이 있어 1초에 한 번만 갱신
  if (now - lastPulseCheck > 1000) {
    lastPulseCheck = now;
    pulseFlag = checkPulse();
  }

  const contact = frameCovered() || pulseFlag;

  if (phase === 'ready') {
    els.fingerRing.classList.toggle('is-covered', contact);
    els.statusText.textContent = t(contact ? 'measuring.detected' : 'measuring.ready');

    if (contact) {
      if (!contactSince) contactSince = now;
      else if (now - contactSince >= PREVIEW_HOLD_MS) startCountdown();
    } else {
      contactSince = 0;
      // 감지가 12초 이상 안 되면 수동 시작 폴백 노출
      if (els.btnManualStart.hidden && now - readyStartTs >= MANUAL_START_AFTER_MS) {
        els.btnManualStart.hidden = false;
      }
    }
  } else if (phase === 'countdown' && !contact) {
    // 카운트다운 중 손가락이 떨어지면 취소
    abortCountdown(true);
  }
}

/**
 * 렌즈가 손가락으로 가려졌는지 — 플래시 OFF 준비 단계의 1차 판정.
 * 가려진 렌즈는 ① 매우 어둡고 ② 프레임 간 변동(손떨림·배경 변화)이 거의 없다.
 */
function frameCovered() {
  const now = performance.now();
  const recent = previewSamples.filter((s) => now - s.t <= 1200);
  if (recent.length < 8) return false;

  const vals = recent.map((s) => s.green);
  let mean = 0;
  for (const v of vals) mean += v;
  mean /= vals.length;

  let jitter = 0;
  for (let i = 1; i < vals.length; i++) jitter += Math.abs(vals[i] - vals[i - 1]);
  jitter /= vals.length - 1;

  return mean < CONTACT_DARK_MAX && jitter < CONTACT_JITTER_MAX;
}

/**
 * 심박 대역 주기성 검출 — 1차 판정(어둠+안정)이 안 될 때의 보조 수단.
 * 밝은 환경에서는 빛이 손가락을 통과해 맥동이 보이지만 렌즈가 '어둡지'는 않다.
 * 스펙트럼 피크가 잡음 바닥(중앙값)보다 확실히 높아야 맥동으로 인정한다.
 */
function checkPulse() {
  if (previewSamples.length < 2) return false;
  const span = previewSamples[previewSamples.length - 1].t - previewSamples[0].t;
  if (span < 4300) return false;

  const { values, fs } = resample(previewSamples, FS);
  if (values.length < fs * 4) return false;

  const filtered = bandpass(values, fs);
  const { bpm, power, spectrum, freqs } = estimateBpm(filtered, fs, { loBpm: 40, hiBpm: 150 });
  if (!bpm) return false;

  const band = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] >= 0.3 && freqs[i] <= 6) band.push(spectrum[i]);
  }
  if (band.length < 8) return false;
  band.sort((a, b) => a - b);
  const median = band[band.length >> 1];
  return median > 0 && power > median * PULSE_SPEC_RATIO;
}

function startCountdown() {
  phase = 'countdown';
  els.btnManualStart.hidden = true;
  els.countdown.hidden = false;
  let n = COUNTDOWN_SEC;
  els.countdown.textContent = String(n);
  countdownTimer = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      beginMeasurement();
      return;
    }
    els.countdown.textContent = String(n);
  }, 1000);
}

/** 카운트다운 취소(손가락 이탈). ready 상태로 되돌린다. */
function abortCountdown(showLost) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  els.countdown.hidden = true;
  phase = 'ready';
  contactSince = 0;
  pulseFlag = false;
  if (showLost) els.statusText.textContent = t('measuring.lost');
}

/* ------------------------------------------------------------------ */
/* 측정 — 본 측정 (플래시 ON)                                          */
/* ------------------------------------------------------------------ */

async function beginMeasurement() {
  if (!camera) return;
  phase = 'measuring';
  els.countdown.hidden = true;
  els.fingerRing.hidden = true;
  els.btnManualStart.hidden = true;
  els.viewMeasuring.classList.remove('is-ready');

  // ── 여기서 플래시를 켠다 (요구사항: 측정 시작 순간에 점화) ──
  // 미지원이어도 화면을 자동으로 채우지 않는다 — 안내 문구로 대체
  let lightMode = 'none';
  try {
    lightMode = await camera.enableTorch();
  } catch {
    /* 광원 없이 진행 */
  }
  if (lightMode === 'torch') {
    els.statusText.textContent = t('measuring.stabilizing');
  } else {
    els.statusText.textContent = t('measuring.noFlash');
  }

  // 화면 조명 토글은 전면 카메라 기기(웹캠 등)에서만 노출 — 자동 점화는 없다
  els.btnScreenLight.hidden = camera.facing !== 'user';
  els.btnScreenLight.classList.remove('is-on');
  els.btnScreenLight.setAttribute('aria-pressed', 'false');

  samples = [];
  startTs = performance.now();
  pausedAt = 0;
  pauseIdx = 0;
  nextLiveAt = LIVE_FROM_SEC;
  notOkSince = 0;
  okSince = 0;
  lastWaveDraw = 0;

  els.liveBpm.textContent = '--';
  els.progressBar.style.width = '0%';

  stopSampling?.();
  stopSampling = startSampling(camera, (s) => {
    if (phase !== 'measuring' && phase !== 'paused') return;
    // t를 "측정 경과 ms"로 기록 — 일시정지해도 시간축이 끊기지 않는다
    samples.push({ t: getElapsedMs(), green: s.green });
    onTick();
  });
}

/** 측정 경과 ms — 일시정지 중에는 시계가 멈춘다 */
function getElapsedMs() {
  return (pausedAt || performance.now()) - startTs;
}

/** 프레임마다 호출 — 이탈 감지, 품질 검사, 진행률, 전체 파형, 실시간 BPM */
function onTick() {
  const now = performance.now();
  const elapsedMs = getElapsedMs();
  const elapsed = elapsedMs / 1000;

  // 품질 검사 (최근 2초)
  const recent = samples.filter((s) => elapsedMs - s.t <= 2000).map((s) => s.green);
  const level = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const q = assessQuality(level, recent, FS);
  const detached = q.reason === 'noContact' || q.reason === 'tooBright';

  // ── 일시정지 중: 재접촉을 기다린다 ──
  if (phase === 'paused') {
    if (!detached) {
      if (!okSince) okSince = now;
      else if (now - okSince >= RESUME_ON_MS) resumeMeasurement(now);
    } else {
      okSince = 0;
    }
    return; // 진행률·파형·타이머 갱신 중단
  }

  // ── 손가락 이탈 판정 → 일시정지 ──
  // 측정 초반(플래시 점화 직후)은 레벨이 튈 수 있어 3초 이후부터 판정
  if (elapsed > 3) {
    if (detached) {
      okSince = 0;
      if (!notOkSince) notOkSince = now;
      else if (now - notOkSince >= PAUSE_ON_MS) {
        enterPause(now);
        return;
      }
    } else {
      notOkSince = 0;
    }
  }

  // 진행률
  const pct = Math.min(100, (elapsed / durationSec) * 100);
  els.progressBar.style.width = `${pct}%`;
  els.remainingText.textContent = `${t('measuring.remaining')} ${Math.max(0, Math.ceil(durationSec - elapsed))}${t('start.seconds')}`;

  if (!q.ok) {
    els.liveBpm.textContent = '--';
    const key = { noContact: 'placing', tooShort: 'stabilizing' }[q.reason] ?? q.reason;
    els.statusText.textContent = t(`measuring.${key}`);
  }

  // 전체 파형 — 0초~경과 시간이 항상 그래프에 가득 찬다 (스로틀)
  if (now - lastWaveDraw >= WAVE_DRAW_INTERVAL_MS) {
    lastWaveDraw = now;
    drawFullWave();
  }

  // 15초 전에는 BPM을 표시하지 않는다 (초기 안정화 구간)
  if (elapsed < LIVE_FROM_SEC) return;
  if (q.ok && elapsed >= nextLiveAt) {
    nextLiveAt += LIVE_STEP_SEC;
    const bpm = computeLiveBpm();
    if (bpm > 0) {
      els.liveBpm.textContent = String(bpm);
      els.statusText.textContent = t('measuring.live');
    }
  }

  if (elapsed >= durationSec) finishMeasurement(q.score);
}

function enterPause(now) {
  phase = 'paused';
  pausedAt = now;
  pauseIdx = samples.length; // 이후 샘플은 재개 시 버린다
  okSince = 0;
  els.pauseOverlay.hidden = false;
  els.liveBpm.textContent = '--';
  els.statusText.textContent = t('measuring.paused');
}

function resumeMeasurement(now) {
  // 일시정지 중 수집된 오염 샘플 폐기 — 시계가 멈춰 있어 t 축이 이어진다
  samples.length = Math.min(samples.length, pauseIdx);
  startTs += now - pausedAt; // 남은 시간 보존
  pausedAt = 0;
  pauseIdx = 0;
  notOkSince = 0;
  okSince = 0;
  phase = 'measuring';
  els.pauseOverlay.hidden = true;
  els.statusText.textContent = t('measuring.resuming');
}

/** 슬라이딩 윈도로 현재 BPM 추정 (실시간 표시용) */
function computeLiveBpm() {
  const { values, fs } = resample(samples, FS);
  if (values.length < fs * 2) return 0;
  const filtered = bandpass(values, fs);
  const { bpm } = estimateBpm(filtered, fs);
  const check = autocorrBpm(filtered, fs);
  // FFT와 자기상관이 크게 벌어지면 신호가 불안정하다고 보고 0 반환
  if (check > 0 && Math.abs(check - bpm) > 15) return 0;
  return bpm;
}

function finishMeasurement(quality) {
  stop();
  resetMeasureUi();

  const { values, fs } = resample(samples, FS);
  if (values.length < fs * 5) {
    showView('start');
    toast(t('error.failed'), 3000);
    return;
  }

  const filtered = bandpass(values, fs);
  const { bpm } = estimateBpm(filtered, fs);
  const beats = detectBeats(filtered, fs);
  const rhythm = analyzeRhythm(beats, fs, { durationSec });
  const shortMeasurement = durationSec < MIN_SEC_FOR_RHYTHM;

  if (bpm <= 0) {
    showView('start');
    toast(t('error.failed'), 3000);
    return;
  }

  const verdict = classifyBpm(bpm);
  lastResult = {
    ts: new Date().toISOString(),
    bpm,
    verdict,
    rhythm: !rhythm.reliable || shortMeasurement ? 'short' : rhythm.irregular ? 'irregular' : 'ok',
    cv: Number(rhythm.cv.toFixed(4)),
    durationSec,
    quality: Number((quality ?? 0).toFixed(3)),
    beats: beats.length,
  };

  addHistory(lastResult);
  renderResult(lastResult);
  showView('result');
}

function stop() {
  stopSampling?.();
  stopSampling = null;
  camera?.stop(); // 플래시·화면 조명 스트립도 함께 꺼진다
  camera = null;
  running = false;
}

/** 측정 화면의 준비용 UI를 모두 원복한다 */
function resetMeasureUi() {
  phase = 'idle';
  els.viewMeasuring.classList.remove('is-ready');
  els.fingerRing.hidden = true;
  els.countdown.hidden = true;
  els.pauseOverlay.hidden = true;
  els.btnManualStart.hidden = true;
  els.btnScreenLight.hidden = true;
  els.btnScreenLight.classList.remove('is-on');
  els.btnScreenLight.setAttribute('aria-pressed', 'false');
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function cancelMeasurement() {
  stop();
  resetMeasureUi();
  showView('start');
}

/**
 * 카메라 오류 안내.
 *
 * ⚠️ 임베드 뷰(iframe·웹뷰)는 Permissions-Policy가 없어 **권한 팝업 자체가
 *    뜨지 않고** NotAllowedError가 난다. 이 경우 사용자에게는 "권한 없음"으로만
 *    보이므로, 반드시 **새 탭에서 열기**를 함께 안내해야 한다.
 *    (실사용 테스트에서 확인된 문제 — 2026-09-11)
 */
function showCameraError(code) {
  els.camErrorText.textContent = t(`error.${code}`);
  els.camErrorUrl.textContent = location.href;
  els.btnOpenTab.href = location.href;
  els.camError.hidden = false;
  els.camError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ------------------------------------------------------------------ */
/* 렌더링                                                              */
/* ------------------------------------------------------------------ */

function renderResult(r) {
  els.resultBpm.textContent = String(r.bpm);
  els.resultCard.dataset.tone = r.rhythm === 'irregular' ? 'irregular' : r.verdict;
  els.resultTitle.textContent = t(`result.${r.verdict}.title`);
  els.resultDesc.textContent = t(`result.${r.verdict}.desc`);
  els.resultRhythm.textContent = t(`result.rhythm.${r.rhythm}`);

  const qualityKey = r.quality >= 0.6 ? 'good' : r.quality >= 0.35 ? 'fair' : 'poor';
  els.resultMeta.textContent = `${formatDateTime(r.ts)} · ${t(`result.quality.${qualityKey}`)} · ${r.beats} beats`;
}

/**
 * 전체 파형 — x축이 항상 0초~경과 시간.
 * 측정 초반에는 몇 초가 그래프에 가득 차고, 진행될수록 전체가 압축되어
 * 처음부터 지금까지의 맥박이 한눈에 보인다.
 *
 * ⚠️ 원시 프레임값을 그리면 프레임 노이즈 때문에 파형이 가늘게 떨린다.
 *    BPM 계산과 동일한 15Hz 재표본화 + 대역통과 필터 신호를 사용하고
 *    표시용으로 3샘플 평활만 얹는다 → 노이즈는 사라지고 맥박 모양은 유지.
 */
function drawFullWave() {
  const cv = els.wave;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);

  const elapsedSec = getElapsedMs() / 1000;
  const xMax = Math.max(elapsedSec, 3); // x축 도메인(초) — 경과 시간에 맞춰 늘어난다
  const axisH = 20; // 하단 시간 눈금 라벨 영역

  // 시간 눈금
  const step = durationSec > 30 ? 10 : 5;
  ctx.lineWidth = 1;
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let s = step; s < xMax; s += step) {
    const x = (s / xMax) * w;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h - axisH + 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.fillText(`${s}${t('start.seconds')}`, x, h - 4);
  }

  const { values, fs } = resample(samples, FS);
  if (values.length < fs * 2) return;

  const filtered = bandpass(values, fs);
  const sm = smooth3(filtered);

  // 파형 영역 (하단은 눈금 라벨에 양보)
  const waveTop = 6;
  const waveBottom = h - axisH;
  const cy = (waveTop + waveBottom) / 2;

  // 진폭 정규화 — 최대값 대신 95백분위 (필터 천이·모션 아티팩트에 둔감)
  const absSorted = Array.from(sm, Math.abs).sort((a, b) => a - b);
  const p95 = absSorted[Math.min(absSorted.length - 1, Math.floor(absSorted.length * 0.95))] ?? 0;
  if (p95 < 0.5) return; // 아직 유의미한 신호가 없다

  const scale = ((waveBottom - waveTop) / 2 * 0.92) / p95;

  // 파형이 눈금 라벨 영역으로 넘치지 않게 클립
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, waveBottom);
  ctx.clip();

  ctx.beginPath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f43f5e';
  for (let i = 0; i < sm.length; i++) {
    const x = ((i / fs) / xMax) * w;
    const y = cy - sm[i] * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // "지금" — 우측 끝 점
  const lastX = ((sm.length - 1) / fs / xMax) * w;
  const lastY = cy - sm[sm.length - 1] * scale;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** 표시용 가벼운 평활 (3샘플 가중 이동평균) — 분석값은 그대로, 선만 부드럽게 */
function smooth3(sig) {
  const out = new Float64Array(sig.length);
  for (let i = 0; i < sig.length; i++) {
    const a = sig[Math.max(0, i - 1)];
    const c = sig[Math.min(sig.length - 1, i + 1)];
    out[i] = (a + 2 * sig[i] + c) / 4;
  }
  return out;
}

function renderHistory() {
  const list = loadHistory();
  els.historyList.innerHTML = '';

  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = t('history.empty');
    els.historyList.appendChild(li);
    drawHistoryChart([]);
    return;
  }

  for (const r of list.slice(0, 30)) {
    const li = document.createElement('li');
    li.className = 'history-item';

    const left = document.createElement('div');
    const bpm = document.createElement('span');
    bpm.className = 'history-bpm';
    bpm.textContent = String(r.bpm);
    const when = document.createElement('span');
    when.className = 'history-when';
    when.textContent = ` ${formatDateTime(r.ts)}`;
    left.append(bpm, when);

    const tag = document.createElement('span');
    tag.className = 'history-tag';
    tag.textContent = t(`result.${r.verdict}.title`);

    li.append(left, tag);
    els.historyList.appendChild(li);
  }
  drawHistoryChart(recentForChart(20));
}

function drawHistoryChart(points) {
  const cv = els.historyChart;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) return;

  const pad = 24;
  const bpms = points.map((p) => p.bpm);
  const min = Math.min(...bpms, 55);
  const max = Math.max(...bpms, 105);
  const x = (i) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (b) => h - pad - ((b - min) / (max - min || 1)) * (h - pad * 2);

  // 정상 범위(60~100) 배경
  ctx.fillStyle = 'rgba(52, 211, 153, 0.12)';
  ctx.fillRect(pad, y(100), w - pad * 2, y(60) - y(100));

  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f43f5e';
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(i), y(p.bpm));
    else ctx.lineTo(x(i), y(p.bpm));
  });
  ctx.stroke();

  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.bpm), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
  });
}

/* ------------------------------------------------------------------ */
/* 이벤트                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  // ⚠️ click만 사용한다 — 브라우저가 마우스 클릭과 터치를 모두 click으로
  //    정규화하므로 이것만으로 두 입력을 동시에 지원한다.
  //    mousedown/touchstart를 직접 쓰면 이중 발화 버그가 난다.
  els.btnStart.addEventListener('click', startMeasurement);
  els.btnCancel.addEventListener('click', cancelMeasurement);
  els.btnAgain.addEventListener('click', () => showView('start'));

  // 수동 시작 폴백 — 자동 감지가 안 되는 환경(밝기·기기 특성) 대비
  els.btnManualStart.addEventListener('click', () => {
    if (phase !== 'ready' && phase !== 'countdown') return;
    abortCountdown(false);
    beginMeasurement();
  });

  document.querySelectorAll('.seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg').forEach((b) => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-checked', 'true');
      durationSec = Number(btn.dataset.duration) || 30;
    });
  });

  els.langToggle.addEventListener('click', async () => {
    const next = getLanguage() === 'ko' ? 'en' : 'ko';
    await initI18n(next);
    applyI18n();
    els.langLabel.textContent = next === 'ko' ? 'EN' : '한국어';
    renderHistory();
    if (lastResult) renderResult(lastResult);
  });

  els.btnClearHistory.addEventListener('click', () => {
    if (!window.confirm(t('history.confirmClear'))) return;
    clearHistory();
    renderHistory();
    toast(t('history.cleared'));
  });

  els.btnSaveImage.addEventListener('click', async () => {
    if (!lastResult) return;
    const blob = await renderResultImage(lastResult, {
      appName: t('app.name'),
      bpmLabel: t('result.bpm'),
      verdict: t(`result.${lastResult.verdict}.title`),
      rhythm: t(`result.rhythm.${lastResult.rhythm}`),
      when: formatDateTime(lastResult.ts),
      disclaimer: t('legal.disclaimer'),
    });
    await shareOrDownload(blob);
  });

  els.tabBar.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    if (tab.dataset.view === 'history') renderHistory();
    showView(tab.dataset.view);
  });

  els.btnInstallNo.addEventListener('click', () => {
    els.installBanner.hidden = true;
  });

  els.btnRetryCam.addEventListener('click', startMeasurement);

  // 화면 조명 토글 — 전면 카메라 기기에서만 노출되며 자동으로는 절대 안 켜진다
  els.btnScreenLight.addEventListener('click', () => {
    const on = !els.btnScreenLight.classList.contains('is-on');
    els.btnScreenLight.classList.toggle('is-on', on);
    els.btnScreenLight.setAttribute('aria-pressed', String(on));
    camera?.setScreenLight(on);
  });

  els.btnInstallOk.addEventListener('click', () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(
      ios
        ? 'Safari 공유 버튼 → "홈 화면에 추가"'
        : '브라우저 메뉴 → "홈 화면에 설치"',
      4000,
    );
  });
}

/** Web Share API 우선, 미지원(PC 등)이면 다운로드 폴백 */
async function shareOrDownload(blob) {
  const file = new File([blob], `hearttune-${Date.now()}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('app.name') });
      return;
    } catch {
      /* 사용자가 취소했거나 실패 — 다운로드 폴백 */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(t('result.saved'));
}

/* ------------------------------------------------------------------ */
/* PWA                                                                 */
/* ------------------------------------------------------------------ */

let deferredPrompt = null;

function initPwa() {
  if ('serviceWorker' in navigator) {
    // ⚠️ GitHub Pages는 /HeartTune-test/ 같은 하위 경로로 배포되므로
    //    절대경로('/sw.js')로 등록하면 404가 난다. 반드시 상대경로.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.installBanner.hidden = false;
    els.btnInstallOk.onclick = async () => {
      deferredPrompt?.prompt();
      await deferredPrompt?.userChoice;
      deferredPrompt = null;
      els.installBanner.hidden = true;
    };
  });
}

/* ------------------------------------------------------------------ */

async function main() {
  cacheEls();
  const lang = await initI18n();
  applyI18n();
  els.langLabel.textContent = lang === 'ko' ? 'EN' : '한국어';
  bindEvents();
  renderHistory();
  showView('start');
  initPwa();
}

main();
