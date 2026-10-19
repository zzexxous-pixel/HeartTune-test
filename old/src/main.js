/**
 * 오늘심박 (HeartTune) — 진입점
 *
 * 측정 흐름 (컨셉 문서 4-1b)
 *   0 ~ 15초   신호 수집 + 품질 체크 (BPM 미표시 — 초기 튀는 값 방지)
 *   15초       첫 BPM 표시
 *   이후 5초마다  슬라이딩 윈도 FFT로 BPM 갱신 (지루함 방지)
 *   측정 종료   최종 BPM 확정 + 리듬(부정맥) 판정 1회
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

const els = {};
let camera = null;
let stopSampling = null;
let durationSec = 30;
let running = false;

/** @type {{t:number, green:number}[]} */
let samples = [];
let startTs = 0;
let nextLiveAt = LIVE_FROM_SEC;
let lastResult = null;

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
/* 측정                                                                */
/* ------------------------------------------------------------------ */

async function startMeasurement() {
  if (running) return;
  running = true;
  samples = [];
  nextLiveAt = LIVE_FROM_SEC;
  showView('measuring');
  els.liveBpm.textContent = '--';
  els.statusText.textContent = t('measuring.placing');
  els.progressBar.style.width = '0%';

  try {
    els.camError.hidden = true;
    camera = new Camera(els.video);
    await camera.start();
  } catch (e) {
    running = false;
    showView('start');
    showCameraError(e.code ?? 'failed');
    return;
  }

  // 플래시가 없으면 안내하고, 전면 카메라 기기면 화면 조명 토글을 노출한다
  if (camera.lightMode !== 'torch') {
    els.statusText.textContent = t('measuring.noFlash');
  }
  els.btnScreenLight.hidden = camera.facing !== 'user';
  els.btnScreenLight.classList.remove('is-on');
  els.btnScreenLight.setAttribute('aria-pressed', 'false');

  startTs = performance.now();
  if (camera.lightMode === 'torch') {
    els.statusText.textContent = t('measuring.stabilizing');
  }

  stopSampling = startSampling(camera, (s) => {
    samples.push({ t: s.t, green: s.green });
    onTick(s);
  });
}

/** 프레임마다 호출 — 품질 검사, 진행률, 실시간 BPM */
function onTick(sample) {
  const elapsed = (performance.now() - startTs) / 1000;

  // 진행률
  const pct = Math.min(100, (elapsed / durationSec) * 100);
  els.progressBar.style.width = `${pct}%`;
  els.remainingText.textContent = `${t('measuring.remaining')} ${Math.max(0, Math.ceil(durationSec - elapsed))}${t('start.seconds')}`;

  // 품질 검사 (최근 2초)
  const recent = samples.filter((s) => sample.t - s.t <= 2000).map((s) => s.green);
  const level = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const q = assessQuality(level, recent, FS);

  if (!q.ok) {
    els.liveBpm.textContent = '--';
    const key = { noContact: 'placing', tooShort: 'stabilizing' }[q.reason] ?? q.reason;
    els.statusText.textContent = t(`measuring.${key}`);
  }

  drawWave(recent);

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
  camera?.stop();
  camera = null;
  running = false;
}

function cancelMeasurement() {
  stop();
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

/** 측정 중 파형 — 사용자가 "되고 있다"는 걸 눈으로 확인하게 한다 */
function drawWave(recent) {
  const cv = els.wave;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  if (recent.length < 3) return;

  let min = Infinity;
  let max = -Infinity;
  for (const v of recent) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;

  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f43f5e';
  recent.forEach((v, i) => {
    const x = (i / (recent.length - 1)) * w;
    const y = h - ((v - min) / span) * (h * 0.8) - h * 0.1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
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
