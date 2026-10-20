import {
  TARGET_FS,
  extractFrameSample,
  resampleUniform,
  analyzePpgSignal,
  generateSyntheticPPG
} from './dsp.js';
import {
  t,
  getLang,
  setLang,
  formatNumber,
  formatDateTime,
  validateI18nKeyParity
} from './i18n.js';
import {
  loadHistory,
  appendRecordToHistory,
  clearStoredData,
  loadCalibrationBaseline,
  saveCalibrationSample
} from './features/storage.js';
import { createCameraController } from './features/camera.js';
import { getResultIndicators, getHistoryPresentation } from './features/result-indicators.js';
import { createSheetController } from './features/sheets.js';
import { shareResultAsImage } from './features/share.js';

const RING_CIRCUMFERENCE = 2 * Math.PI * 106;
const DEBUG_MIN_HEIGHT = 200;
const DEBUG_MAX_RATIO = 0.8;

// 기저 심박수/필터 대역 학습값은 features/storage.js 가 관리합니다.
const initialBaseline = loadCalibrationBaseline();

// 애플리케이션 상태
const state = {
  isMeasuring: false,
  isStarting: false,
  durationSec: 30,
  startTimeMs: 0,
  lastSampleMs: 0,
  lastAdaptiveTickSec: 0,
  rawSamples: [],
  frameHandle: null,
  usingRVFC: false,
  simMode: 'camera',
  syntheticPrebuffer: null,
  lastResult: null,
  stealthClicks: 0,
  stealthTimer: null,
  facingMode: 'environment',
  cameraState: 'idle', // idle | starting | ready | error
  previewToken: 0,

  // 적응형 캘리브레이션 & 수동 샌드박스 상태
  priorBpm: initialBaseline.priorBpm,
  currentFilter: {
    hp: initialBaseline.avgHp,
    lp: initialBaseline.avgLp,
    centerBpm: initialBaseline.priorBpm,
    locked: false,
    mode: 'wide'
  },
  manualOverride: false,
  manualHp: 0.70,
  manualLp: 4.00
};

// DOM 참조
const els = {
  appTitleTrigger: document.getElementById('appTitleTrigger'),
  btnMenu: document.getElementById('btnMenu'),
  btnSettings: document.getElementById('btnSettings'),
  btnLangToggle: document.getElementById('btnLangToggle'),
  durBtns: document.querySelectorAll('.dur-btn'),
  camBtns: document.querySelectorAll('.cam-btn'),
  langBtns: document.querySelectorAll('.lang-btn'),
  liveAlertBox: document.getElementById('liveAlertBox'),
  stageGuideText: document.getElementById('stageGuideText'),
  progressRingBar: document.getElementById('progressRingBar'),
  cameraVideo: document.getElementById('cameraVideo'),
  bpmNumber: document.getElementById('bpmNumber'),
  heartBeatIcon: document.getElementById('heartBeatIcon'),
  timerBadge: document.getElementById('timerBadge'),
  calibStatusText: document.getElementById('calibStatusText'),
  activeBandText: document.getElementById('activeBandText'),
  waveformCanvas: document.getElementById('waveformCanvas'),
  samplingCanvas: document.getElementById('samplingCanvas'),
  resultBanner: document.getElementById('resultBanner'),
  resultIcon: document.getElementById('resultIcon'),
  resultTitle: document.getElementById('resultTitle'),
  resultDesc: document.getElementById('resultDesc'),
  resultShortNote: document.getElementById('resultShortNote'),
  indicatorQualityState: document.getElementById('indicatorQualityState'),
  btnDetails: document.getElementById('btnDetails'),
  btnPrimaryMeasure: document.getElementById('btnPrimaryMeasure'),
  btnShareImage: document.getElementById('btnShareImage'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  trendSummaryText: document.getElementById('trendSummaryText'),
  trendCanvas: document.getElementById('trendCanvas'),
  historyList: document.getElementById('historyList'),
  menuHistory: document.getElementById('menuHistory'),
  menuGuide: document.getElementById('menuGuide'),
  menuLegal: document.getElementById('menuLegal'),
  sheetBackdrop: document.getElementById('sheetBackdrop'),
  settingsSheet: document.getElementById('settingsSheet'),
  menuSheet: document.getElementById('menuSheet'),
  historySheet: document.getElementById('historySheet'),
  guideSheet: document.getElementById('guideSheet'),
  legalSheet: document.getElementById('legalSheet'),
  detailsSheet: document.getElementById('detailsSheet'),
  detailsDate: document.getElementById('detailsDate'),
  detailsDuration: document.getElementById('detailsDuration'),
  detailsBpm: document.getElementById('detailsBpm'),
  detailsBpmUnit: document.getElementById('detailsBpmUnit'),
  detailsWaveformCanvas: document.getElementById('detailsWaveformCanvas'),
  debugConsole: document.getElementById('debugConsole'),
  debugResizeHandle: document.getElementById('debugResizeHandle'),
  btnCloseDebug: document.getElementById('btnCloseDebug'),
  simPresetBtns: document.querySelectorAll('.sim-preset'),
  lblFilterMode: document.getElementById('lblFilterMode'),
  btnResetAutoTune: document.getElementById('btnResetAutoTune'),
  sliderHpCutoff: document.getElementById('sliderHpCutoff'),
  sliderLpCutoff: document.getElementById('sliderLpCutoff'),
  lblHpCutoff: document.getElementById('lblHpCutoff'),
  lblLpCutoff: document.getElementById('lblLpCutoff'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  debugLogList: document.getElementById('debugLogList')
};

const samplingCtx = els.samplingCanvas.getContext('2d', { willReadFrequently: true });
const waveCtx = els.waveformCanvas.getContext('2d');

let toastTimer = null;

function logDebug(msg) {
  const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const line = document.createElement('div');
  line.textContent = `[${timeStr}] ${msg}`;
  els.debugLogList.prepend(line);
  while (els.debugLogList.children.length > 60) {
    els.debugLogList.removeChild(els.debugLogList.lastChild);
  }
}

function showAlert(msg, durationMs = 4500) {
  els.liveAlertBox.textContent = msg;
  els.liveAlertBox.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideAlert, durationMs);
}

function hideAlert() {
  els.liveAlertBox.classList.remove('visible');
  els.liveAlertBox.textContent = '';
  clearTimeout(toastTimer);
  toastTimer = null;
}

// 카메라 제어(스트림/토치/전면·후면 전환)는 features/camera.js 로 분리
const camera = createCameraController({
  videoEl: els.cameraVideo,
  log: (msg) => logDebug(msg)
});

// 바텀시트(설정·메뉴·이력·안내·법적 고지·상세)는 features/sheets.js 가 관리
const sheets = createSheetController({
  backdrop: els.sheetBackdrop,
  onOpen: (sheet) => logDebug(`Sheet opened: ${sheet.id}`),
  onClose: (sheet) => logDebug(`Sheet closed: ${sheet.id}`),
  log: () => {}
});

function playTone(freq = 520, durationMs = 120) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    setTimeout(() => ctx.close(), durationMs + 100);
  } catch (_) {
    // 오디오 미지원 환경 무시
  }
}

function updateCalibBannerUI() {
  const base = loadCalibrationBaseline();
  state.priorBpm = base.priorBpm;
  if (!state.isMeasuring) {
    els.calibStatusText.textContent = `기저 평균: ${base.priorBpm} bpm (최근 ${base.count}건 학습)`;
    els.activeBandText.textContent = `초기 대역: ${base.avgHp.toFixed(2)} ~ ${base.avgLp.toFixed(2)} Hz`;
  }
}

function updateIdleGuide() {
  if (state.isMeasuring) return;
  if (state.lastResult) {
    els.stageGuideText.textContent = t('measure.status.completed');
    return;
  }
  if (state.cameraState === 'starting') {
    els.stageGuideText.textContent = t('measure.status.cameraStarting');
    return;
  }
  if (state.cameraState === 'error') {
    els.stageGuideText.textContent = t('measure.status.cameraUnavailable');
    return;
  }
  els.stageGuideText.textContent = t('measure.status.readyTitle');
}

function syncCameraButtons() {
  els.camBtns.forEach((btn) => {
    const active = btn.getAttribute('data-facing') === state.facingMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function syncLangButtons() {
  const lang = getLang();
  els.langBtns.forEach((btn) => {
    const active = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function syncConfigUI() {
  els.durBtns.forEach((btn) => {
    btn.classList.toggle('active', Number(btn.getAttribute('data-duration')) === state.durationSec);
  });
  syncCameraButtons();
  syncLangButtons();
}

function setConfigBusy(busy) {
  els.durBtns.forEach((btn) => {
    btn.disabled = busy;
  });
  els.camBtns.forEach((btn) => {
    btn.disabled = busy;
  });
}

function applyTranslations() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });

  if (state.isMeasuring) {
    els.btnPrimaryMeasure.textContent = t('measure.cta.stop');
    els.stageGuideText.textContent = t('measure.status.measuringLive');
  } else if (state.lastResult) {
    els.btnPrimaryMeasure.textContent = t('measure.cta.remeasure');
    renderResultBanner(state.lastResult);
    updateIdleGuide();
  } else {
    els.btnPrimaryMeasure.textContent = t('measure.cta.start');
    updateIdleGuide();
  }

  syncConfigUI();
  drawLiveWaveform();
  updateCalibBannerUI();
  renderHistory();
  document.body.classList.add('i18n-ready');
}

function formatTimer(secLeft) {
  const s = Math.max(0, Math.ceil(secLeft));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateProgressRing(progressRatio) {
  const clamped = Math.max(0, Math.min(1, progressRatio));
  const offset = RING_CIRCUMFERENCE * (1 - clamped);
  els.progressRingBar.style.strokeDashoffset = String(offset);
}

function drawLiveWaveform() {
  const w = els.waveformCanvas.width;
  const h = els.waveformCanvas.height;
  waveCtx.clearRect(0, 0, w, h);

  waveCtx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  waveCtx.lineWidth = 1;
  waveCtx.beginPath();
  waveCtx.moveTo(0, h / 2);
  waveCtx.lineTo(w, h / 2);
  waveCtx.stroke();

  const recent = state.rawSamples.slice(-90);
  if (recent.length < 3) return;

  let minV = Infinity;
  let maxV = -Infinity;
  for (const pt of recent) {
    if (pt.v < minV) minV = pt.v;
    if (pt.v > maxV) maxV = pt.v;
  }
  const range = Math.max(0.8, maxV - minV);

  waveCtx.strokeStyle = '#38BDF8';
  waveCtx.lineWidth = 2.5;
  waveCtx.lineJoin = 'round';
  waveCtx.beginPath();

  recent.forEach((pt, idx) => {
    const x = (idx / (recent.length - 1)) * (w - 16) + 8;
    const normY = (pt.v - minV) / range;
    const y = h - 10 - normY * (h - 20);
    if (idx === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  });
  waveCtx.stroke();
}

function prepareSimulationSignal() {
  const presetMap = {
    normal: { bpm: 72, jitterRatio: 0.02, noiseAmp: 0.2 },
    brady: { bpm: 52, jitterRatio: 0.02, noiseAmp: 0.2 },
    tachy: { bpm: 118, jitterRatio: 0.02, noiseAmp: 0.2 },
    irregular: { bpm: 78, jitterRatio: 0.42, noiseAmp: 0.25 }
  };
  const cfg = presetMap[state.simMode] || presetMap.normal;
  state.syntheticPrebuffer = generateSyntheticPPG({
    bpm: cfg.bpm,
    durationSec: state.durationSec + 5,
    fs: TARGET_FS,
    jitterRatio: cfg.jitterRatio,
    noiseAmp: cfg.noiseAmp,
    seed: 20260911
  });
  logDebug(`Prepared synthetic PPG: mode=${state.simMode}, targetBPM=${cfg.bpm}`);
}

function buildAnalysisOptions() {
  return {
    priorBpm: state.priorBpm,
    prevFilter: state.currentFilter,
    manualHp: state.manualOverride ? state.manualHp : null,
    manualLp: state.manualOverride ? state.manualLp : null
  };
}

function scheduleNextFrame() {
  if (!state.isMeasuring) return;
  if (state.simMode === 'camera' && typeof els.cameraVideo.requestVideoFrameCallback === 'function') {
    state.usingRVFC = true;
    state.frameHandle = els.cameraVideo.requestVideoFrameCallback(onFrameTick);
  } else {
    state.usingRVFC = false;
    state.frameHandle = requestAnimationFrame(onFrameTick);
  }
}

function onFrameTick() {
  if (!state.isMeasuring) return;
  const now = performance.now();
  const elapsedSec = (now - state.startTimeMs) / 1000;

  // 15Hz (약 64ms) 샘플링 제한
  if (now - state.lastSampleMs >= 64) {
    state.lastSampleMs = now;

    if (state.simMode === 'camera') {
      samplingCtx.drawImage(els.cameraVideo, 0, 0, 64, 64);
      const imgData = samplingCtx.getImageData(0, 0, 64, 64).data;
      const sample = extractFrameSample(imgData, 64, 64);

      if (!sample.isFingerDetected) {
        if (sample.qualityHint === 'tooDark') showAlert(t('error.signal.tooDark'));
        else if (sample.qualityHint === 'tooBright') showAlert(t('error.signal.tooBright'));
        else showAlert(t('error.signal.pressHarder'));
      } else {
        hideAlert();
      }

      state.rawSamples.push({ t: now, v: sample.value });
    } else {
      const sampleIdx = Math.min(
        state.syntheticPrebuffer.length - 1,
        Math.floor(elapsedSec * TARGET_FS)
      );
      const simVal = state.syntheticPrebuffer[sampleIdx];
      state.rawSamples.push({ t: now, v: simVal });
    }

    drawLiveWaveform();
  }

  const remainingSec = Math.max(0, state.durationSec - elapsedSec);
  els.timerBadge.textContent = formatTimer(remainingSec);
  updateProgressRing(elapsedSec / state.durationSec);

  // 5초 시점 고속 초기 캘리브레이션 + 이후 측정 종료까지 2초 주기로 지속적 적응형 트래킹(Throttled 2s)
  if (elapsedSec < 5) {
    els.stageGuideText.textContent =
      state.simMode === 'camera' ? t('measure.status.stabilizing') : t('measure.status.simulating');
  } else {
    const tickStep = Math.floor(elapsedSec);
    // 5초에 첫 캘리브레이션 포착 후 매 2초(5, 7, 9, 11, 13, 15, ...)마다 필터 대역 추적 및 BPM 갱신
    if (tickStep >= 5 && tickStep - state.lastAdaptiveTickSec >= 2 && elapsedSec < state.durationSec) {
      const isFirstLock = state.lastAdaptiveTickSec === 0;
      state.lastAdaptiveTickSec = tickStep;

      const uniform = resampleUniform(state.rawSamples, TARGET_FS);
      const liveAnalysis = analyzePpgSignal(uniform, TARGET_FS, buildAnalysisOptions());

      if (liveAnalysis.filterState) {
        state.currentFilter = liveAnalysis.filterState;
        els.calibStatusText.textContent = `캘리브레이션: ${liveAnalysis.filterState.mode.toUpperCase()} (중심 ${liveAnalysis.filterState.centerBpm} bpm)`;
        els.activeBandText.textContent = `Band: ${liveAnalysis.filterState.hp.toFixed(2)} ~ ${liveAnalysis.filterState.lp.toFixed(2)} Hz`;
      }

      if (liveAnalysis.bpm > 0) {
        els.bpmNumber.textContent = formatNumber(liveAnalysis.bpm);
        els.stageGuideText.textContent = t('measure.status.measuringLive');
        if (isFirstLock) {
          playTone(660, 110);
        }
        logDebug(
          `[@${tickStep}s] BPM=${liveAnalysis.bpm} | Mode=${liveAnalysis.filterState.mode} | Band=${liveAnalysis.filterState.hp}~${liveAnalysis.filterState.lp}Hz | Q=${liveAnalysis.qualityScore}%`
        );
      }
    }
  }

  if (elapsedSec >= state.durationSec) {
    finishMeasurement();
    return;
  }

  scheduleNextFrame();
}

/**
 * 페이지 진입 시 카메라만 켜 둔다(토치 OFF).
 * 손가락 위치를 미리 잡을 수 있고, 측정 시작 시 토치만 켜면 된다.
 */
async function openIdleCamera() {
  if (state.isMeasuring || state.isStarting) return;
  if (state.simMode !== 'camera') return;
  if (camera.isOpen) {
    state.cameraState = 'ready';
    updateIdleGuide();
    return;
  }

  const token = ++state.previewToken;
  state.cameraState = 'starting';
  updateIdleGuide();

  try {
    await camera.open({ torch: false });
    if (token !== state.previewToken) {
      // 그 사이 시뮬레이션 모드로 바뀌었거나 화면이 숨겨진 경우에만 스트림을 정리한다.
      if (state.simMode !== 'camera' || document.hidden) camera.stop();
      return;
    }
    state.cameraState = 'ready';
    logDebug('Preview camera opened (torch off).');
  } catch (err) {
    if (token !== state.previewToken) return;
    state.cameraState = 'error';
    logDebug(`Idle camera error: ${err.name} - ${err.message}`);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showAlert(t('error.camera.denied'), 6000);
    } else {
      showAlert(t('error.camera.notFound'), 6000);
    }
  }
  updateIdleGuide();
}

async function startMeasurement() {
  if (state.isMeasuring) {
    cancelMeasurement();
    return;
  }
  if (state.isStarting) return;

  const base = loadCalibrationBaseline();
  state.priorBpm = base.priorBpm;
  state.currentFilter = {
    hp: base.avgHp,
    lp: base.avgLp,
    centerBpm: base.priorBpm,
    locked: false,
    mode: 'wide'
  };

  state.rawSamples = [];
  drawLiveWaveform();
  state.lastAdaptiveTickSec = 0;
  state.lastResult = null;
  document.body.classList.remove('has-result');
  els.resultBanner.className = 'result-banner';
  els.resultShortNote.hidden = true;
  els.btnShareImage.hidden = true;
  els.bpmNumber.textContent = '--';
  els.timerBadge.textContent = formatTimer(state.durationSec);
  updateProgressRing(0);
  updateCalibBannerUI();

  if (state.simMode === 'camera') {
    state.isStarting = true;
    els.btnPrimaryMeasure.disabled = true;
    // 진행 중인 미리보기 열기와 경합하지 않도록 토큰을 올려 둔다.
    state.previewToken++;
    state.cameraState = 'starting';
    updateIdleGuide();
    try {
      await camera.open({ torch: state.facingMode === 'environment' });
      state.cameraState = 'ready';
      hideAlert();
    } catch (err) {
      logDebug(`Camera open error: ${err.name} - ${err.message}`);
      state.cameraState = 'error';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showAlert(t('error.camera.denied'), 6000);
      } else {
        showAlert(t('error.camera.notFound'), 6000);
      }
      state.isStarting = false;
      els.btnPrimaryMeasure.disabled = false;
      updateIdleGuide();
      return;
    }
    state.isStarting = false;
    els.btnPrimaryMeasure.disabled = false;
  } else {
    prepareSimulationSignal();
    hideAlert();
  }

  state.isMeasuring = true;
  document.body.classList.add('is-measuring');
  syncConfigUI();
  state.startTimeMs = performance.now();
  state.lastSampleMs = state.startTimeMs;
  setConfigBusy(true);
  els.heartBeatIcon.classList.add('beating');
  els.btnPrimaryMeasure.classList.add('measuring');
  els.btnPrimaryMeasure.textContent = t('measure.cta.stop');
  els.btnShareImage.hidden = true;
  playTone(480, 100);
  logDebug(
    `Measurement started (${state.durationSec}s, mode=${state.simMode}, priorBPM=${state.priorBpm})`
  );

  scheduleNextFrame();
}

function stopFrameLoop() {
  if (state.frameHandle) {
    if (state.usingRVFC && els.cameraVideo.cancelVideoFrameCallback) {
      els.cameraVideo.cancelVideoFrameCallback(state.frameHandle);
    } else {
      cancelAnimationFrame(state.frameHandle);
    }
    state.frameHandle = null;
  }
}

function cancelMeasurement() {
  state.isMeasuring = false;
  state.isStarting = false;
  document.body.classList.remove('is-measuring');
  syncConfigUI();
  stopFrameLoop();
  camera.setTorch(false).catch(() => {});
  setConfigBusy(false);
  els.btnPrimaryMeasure.disabled = false;
  els.heartBeatIcon.classList.remove('beating');
  els.btnPrimaryMeasure.classList.remove('measuring');
  els.btnPrimaryMeasure.textContent = t('measure.cta.start');
  els.stageGuideText.textContent = t('measure.status.readyTitle');
  state.rawSamples = [];
  drawLiveWaveform();
  els.timerBadge.textContent = formatTimer(state.durationSec);
  updateProgressRing(0);
  updateCalibBannerUI();
  logDebug('Measurement cancelled by user.');
}

function finishMeasurement() {
  state.isMeasuring = false;
  document.body.classList.remove('is-measuring');
  syncConfigUI();
  stopFrameLoop();
  camera.setTorch(false).catch(() => {});
  setConfigBusy(false);
  els.heartBeatIcon.classList.remove('beating');
  els.btnPrimaryMeasure.classList.remove('measuring');
  els.btnPrimaryMeasure.textContent = t('measure.cta.remeasure');
  updateProgressRing(1);

  const uniform = resampleUniform(state.rawSamples, TARGET_FS);
  const result = analyzePpgSignal(uniform, TARGET_FS, buildAnalysisOptions());

  if (navigator.vibrate) {
    navigator.vibrate([120, 60, 160]);
  }
  playTone(784, 180);

  // 측정 품질이 우수하면 로컬 스토리지 최근 30건 캘리브레이션 큐에 누적 학습
  if (result.filterState) {
    saveCalibrationSample(result.bpm, result.filterState, result.qualityScore);
  }

  const wfSummary = Array.from(result.filteredSignal.slice(-60)).map((v) => Number(v.toFixed(2)));

  const record = {
    id: `ht_${Date.now()}`,
    timestamp: Date.now(),
    bpm: result.bpm || state.priorBpm,
    status: result.status,
    irregular: result.irregular,
    cv: result.cv,
    rmssdMs: result.rmssdMs,
    duration: state.durationSec,
    quality: result.qualityScore,
    beatCount: result.beatCount,
    isShortMeasurement: result.isShortMeasurement,
    waveform: wfSummary
  };

  state.lastResult = record;
  document.body.classList.add('has-result');
  els.bpmNumber.textContent = formatNumber(record.bpm);
  els.stageGuideText.textContent = t('measure.status.completed');
  drawLiveWaveform();

  updateCalibBannerUI();
  renderResultBanner(record);
  saveRecordToHistory(record);
  els.btnShareImage.hidden = false;
  logDebug(
    `Measurement completed: BPM=${record.bpm}, status=${record.status}, CV=${record.cv}, saved to 30-run baseline.`
  );
}

// 결과 배지 아이콘: 이모지는 기기/폰트에 따라 다르게 보이거나 사라질 수 있어 SVG 로 고정한다.
// (색만으로 상태를 전달하지 않는다는 원칙 — 색 + 아이콘 + 문구를 함께 사용)
const SVG_CHECK = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M6.8 12.4l3.4 3.4 7-7.2" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_DOWN = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.5v11M7.5 13l4.5 4.5 4.5-4.5" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_UP = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 17.5v-11M7.5 11L12 6.5 16.5 11" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_ALERT = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.8v7.4" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.6" fill="#FFFFFF"/></svg>';

const RESULT_ICONS = {
  normal: SVG_CHECK,
  brady: SVG_DOWN,
  tachy: SVG_UP,
  irregular: SVG_ALERT
};

function renderResultIndicators(record) {
  const indicators = getResultIndicators(record);
  ['arrhythmia', 'bradycardia', 'tachycardia'].forEach((name) => {
    const card = document.querySelector(`[data-indicator="${name}"]`);
    const active = indicators[name];
    card.classList.toggle('is-active', active);
    card.classList.toggle('is-clear', !active);
    card.setAttribute('aria-label', `${t(`measure.indicator.${name}`)}: ${t(active ? 'measure.indicator.detected' : 'measure.indicator.notDetected')}`);
    card.querySelector('[data-indicator-state]').textContent = t(active ? 'measure.indicator.detected' : 'measure.indicator.notDetected');
  });

  const qualityCard = document.querySelector('[data-indicator="signal-quality"]');
  qualityCard.classList.remove('quality-good', 'quality-fair', 'quality-poor', 'quality-unknown');
  qualityCard.classList.add(`quality-${indicators.quality}`);
  qualityCard.setAttribute('aria-label', `${t('measure.indicator.signalQuality')}: ${t(`measure.indicator.quality.${indicators.quality}`)}`);
  els.indicatorQualityState.textContent = t(`measure.indicator.quality.${indicators.quality}`);
}

function drawDetailsWaveform(record) {
  const canvas = els.detailsWaveformCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  const waveform = Array.isArray(record.waveform) ? record.waveform : [];
  if (waveform.length < 2) return;
  const min = Math.min(...waveform);
  const max = Math.max(...waveform);
  const range = Math.max(0.001, max - min);
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  waveform.forEach((value, index) => {
    const x = 12 + (index / (waveform.length - 1)) * (width - 24);
    const y = height - 12 - ((value - min) / range) * (height - 24);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderDetails(record) {
  if (!record) return;
  els.detailsDate.textContent = formatDateTime(record.timestamp);
  els.detailsDuration.textContent = t('details.duration.value', { seconds: record.duration });
  els.detailsBpm.textContent = formatNumber(record.bpm);
  drawDetailsWaveform(record);
  renderResultIndicators(record);
}

function renderResultBanner(record) {
  els.resultBanner.className = `result-banner visible status-${record.status}`;
  els.resultIcon.innerHTML = RESULT_ICONS[record.status] || RESULT_ICONS.normal;
  els.resultTitle.textContent = t(`result.${record.status}.title`);
  els.resultDesc.textContent = t(`result.${record.status}.desc`);
  els.resultShortNote.hidden = !record.isShortMeasurement;
  renderResultIndicators(record);
}

function saveRecordToHistory(record) {
  try {
    appendRecordToHistory(record);
    renderHistory();
  } catch (err) {
    logDebug(`localStorage save error: ${err.message}`);
  }
}

function renderHistory() {
  const list = loadHistory();
  els.historyList.innerHTML = '';

  if (list.length === 0) {
    els.trendSummaryText.textContent = t('history.empty.text');
    drawTrendChart([]);
    return;
  }

  if (list.length === 1) {
    els.trendSummaryText.textContent = t('history.trend.first');
  } else {
    const latest = list[0].bpm;
    const prevSlice = list.slice(1, 8);
    const prevAvg = Math.round(prevSlice.reduce((s, r) => s + r.bpm, 0) / prevSlice.length);
    const diff = latest - prevAvg;
    if (Math.abs(diff) <= 2) {
      els.trendSummaryText.textContent = t('history.trend.same');
    } else if (diff > 2) {
      els.trendSummaryText.textContent = t('history.trend.faster', { diff: Math.abs(diff) });
    } else {
      els.trendSummaryText.textContent = t('history.trend.slower', { diff: Math.abs(diff) });
    }
  }

  drawTrendChart(list.slice(0, 14).reverse());

  list.slice(0, 30).forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const presentation = getHistoryPresentation(item);
    const indicators = getResultIndicators(item);
    const detail = document.createElement('div');
    detail.className = 'history-detail';
    const signalText = document.createElement('div');
    signalText.className = `history-signals ${presentation.isAbnormal ? 'is-abnormal' : 'is-normal'}`;
    signalText.textContent = presentation.isAbnormal
      ? t('history.status.suspected', {
        signals: presentation.signals.map((name) => t(`measure.indicator.${name}`)).join(', ')
      })
      : t('history.status.normal');
    const qualityText = document.createElement('div');
    qualityText.className = 'history-quality';
    qualityText.textContent = `${t('measure.indicator.signalQuality')}: ${t(`measure.indicator.quality.${indicators.quality}`)}`;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = `${formatDateTime(item.timestamp)} · ${t('details.duration.value', { seconds: item.duration })}`;
    detail.append(signalText, qualityText, meta);

    const bpm = document.createElement('div');
    bpm.className = `history-bpm${presentation.abnormalRate ? ' is-abnormal-rate' : ''}`;
    bpm.append(document.createTextNode(formatNumber(item.bpm)));
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = t('measure.unit.bpm');
    bpm.append(unit);
    li.append(detail, bpm);
    els.historyList.appendChild(li);
  });
}

function drawTrendChart(records) {
  const ctx = els.trendCanvas.getContext('2d');
  const w = els.trendCanvas.width;
  const h = els.trendCanvas.height;
  ctx.clearRect(0, 0, w, h);

  if (records.length === 0) return;

  const bpms = records.map((r) => r.bpm);
  const minB = Math.min(50, ...bpms) - 5;
  const maxB = Math.max(110, ...bpms) + 5;
  const span = Math.max(10, maxB - minB);

  ctx.strokeStyle = '#0F4C81';
  ctx.lineWidth = 3;
  ctx.beginPath();

  records.forEach((rec, i) => {
    const x = records.length === 1 ? w / 2 : 24 + (i / (records.length - 1)) * (w - 48);
    const y = h - 22 - ((rec.bpm - minB) / span) * (h - 44);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  records.forEach((rec, i) => {
    const x = records.length === 1 ? w / 2 : 24 + (i / (records.length - 1)) * (w - 48);
    const y = h - 22 - ((rec.bpm - minB) / span) * (h - 44);
    ctx.fillStyle = getHistoryPresentation(rec).isAbnormal ? '#DC2626' : '#16A34A';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function switchCamera(facing) {
  if (state.isMeasuring || state.isStarting) return;
  if (facing !== 'environment' && facing !== 'user') return;
  if (state.facingMode === facing) return;

  state.facingMode = facing;
  camera.setFacing(facing);
  syncCameraButtons();
  logDebug(`Camera facing switched to: ${facing}`);

  if (state.simMode !== 'camera') return;

  const token = ++state.previewToken;
  state.cameraState = 'starting';
  updateIdleGuide();
  try {
    await camera.open({ torch: false });
    if (token === state.previewToken) state.cameraState = 'ready';
  } catch (err) {
    if (token === state.previewToken) {
      state.cameraState = 'error';
      showAlert(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? t('error.camera.denied')
          : t('error.camera.notFound'),
        6000
      );
    }
  }
  updateIdleGuide();
}

/* --------------------------------------------------------------------------
   이벤트 바인딩 (5-7절 원칙: click 이벤트 일원화)
   -------------------------------------------------------------------------- */
els.btnPrimaryMeasure.addEventListener('click', () => {
  startMeasurement();
});

els.btnShareImage.addEventListener('click', () => {
  shareResultAsImage(state.lastResult, { t, formatDateTime });
});

els.btnLangToggle.addEventListener('click', () => {
  const next = getLang() === 'ko' ? 'en' : 'ko';
  setLang(next);
  applyTranslations();
});

els.langBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const lang = btn.getAttribute('data-lang');
    if (!lang || lang === getLang()) return;
    setLang(lang);
    applyTranslations();
  });
});

els.btnSettings.addEventListener('click', () => {
  syncConfigUI();
  sheets.open(els.settingsSheet, els.btnSettings);
});

els.btnMenu.addEventListener('click', () => {
  sheets.open(els.menuSheet, els.btnMenu);
});

els.menuHistory.addEventListener('click', () => {
  renderHistory();
  sheets.open(els.historySheet, els.btnMenu);
});

els.menuGuide.addEventListener('click', () => {
  sheets.open(els.guideSheet, els.btnMenu);
});

els.menuLegal.addEventListener('click', () => {
  sheets.open(els.legalSheet, els.btnMenu);
});

els.btnDetails.addEventListener('click', () => {
  renderDetails(state.lastResult);
  sheets.open(els.detailsSheet, els.btnDetails);
});

els.durBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.isMeasuring) return;
    state.durationSec = Number(btn.getAttribute('data-duration'));
    els.durBtns.forEach((b) => b.classList.toggle('active', b === btn));
    els.timerBadge.textContent = formatTimer(state.durationSec);
  });
});

els.camBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchCamera(btn.getAttribute('data-facing'));
  });
});

els.btnClearHistory.addEventListener('click', () => {
  clearStoredData();
  updateCalibBannerUI();
  renderHistory();
});

// 스텔스 디버그 트리거: 타이틀 2초 내 5회 연속 클릭
els.appTitleTrigger.addEventListener('click', () => {
  state.stealthClicks++;
  clearTimeout(state.stealthTimer);
  state.stealthTimer = setTimeout(() => {
    state.stealthClicks = 0;
  }, 2000);

  if (state.stealthClicks >= 5) {
    state.stealthClicks = 0;
    els.debugConsole.classList.toggle('open');
    logDebug('Stealth debug console toggled.');
  }
});

els.btnCloseDebug.addEventListener('click', () => {
  els.debugConsole.classList.remove('open');
});

els.simPresetBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.simMode = btn.getAttribute('data-sim');
    els.simPresetBtns.forEach((b) => b.classList.toggle('active', b === btn));
      logDebug(`Simulation mode switched to: ${state.simMode}`);

    if (state.simMode !== 'camera') {
      state.previewToken++;
      camera.stop();
      state.cameraState = 'idle';
    } else if (!state.isMeasuring) {
      openIdleCamera();
    }
  });
});

// 샌드박스 수동 필터 오버라이드 및 자동 복귀
els.sliderHpCutoff.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  state.manualOverride = true;
  state.manualHp = val;
  els.lblHpCutoff.textContent = val.toFixed(2);
  els.lblFilterMode.textContent = 'MANUAL (수동 슬라이더)';
  logDebug(`Manual HPF override: ${val.toFixed(2)} Hz`);
});

els.sliderLpCutoff.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  state.manualOverride = true;
  state.manualLp = val;
  els.lblLpCutoff.textContent = val.toFixed(2);
  els.lblFilterMode.textContent = 'MANUAL (수동 슬라이더)';
  logDebug(`Manual LPF override: ${val.toFixed(2)} Hz`);
});

els.btnResetAutoTune.addEventListener('click', () => {
  state.manualOverride = false;
  els.lblFilterMode.textContent = 'AUTO (적응형 트래킹)';
  logDebug('Filter mode reset to AUTO adaptive tracking.');
});

// 실측 원시 신호 CSV 다운로드
els.btnExportCsv.addEventListener('click', () => {
  if (state.rawSamples.length === 0) {
    showAlert('수집된 실측 샘플이 없습니다. 먼저 측정을 진행해 주세요.');
    return;
  }
  let csv = 'Index,TimeMs,RawValue\n';
  state.rawSamples.forEach((s, idx) => {
    csv += `${idx},${s.t.toFixed(2)},${s.v.toFixed(4)}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HeartTune_RawPPG_${Date.now()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  logDebug(`Exported ${state.rawSamples.length} raw samples to CSV.`);
});

/* --------------------------------------------------------------------------
   디버그 콘솔 크기 조절 — 상단 경계 드래그 (--debug-height)
   -------------------------------------------------------------------------- */
function setDebugHeight(heightPx) {
  const max = window.innerHeight * DEBUG_MAX_RATIO;
  const clamped = Math.min(max, Math.max(DEBUG_MIN_HEIGHT, heightPx));
  document.documentElement.style.setProperty('--debug-height', `${Math.round(clamped)}px`);
}

let debugDrag = null;

els.debugResizeHandle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  debugDrag = { pointerId: event.pointerId };
  if (els.debugResizeHandle.setPointerCapture) {
    try {
      els.debugResizeHandle.setPointerCapture(event.pointerId);
    } catch (_) {
      // 무시
    }
  }
  document.body.classList.add('resizing-debug');
});

els.debugResizeHandle.addEventListener('pointermove', (event) => {
  if (!debugDrag) return;
  setDebugHeight(window.innerHeight - event.clientY);
});

function endDebugDrag() {
  if (!debugDrag) return;
  debugDrag = null;
  document.body.classList.remove('resizing-debug');
}

els.debugResizeHandle.addEventListener('pointerup', endDebugDrag);
els.debugResizeHandle.addEventListener('pointercancel', endDebugDrag);
els.debugResizeHandle.addEventListener('lostpointercapture', endDebugDrag);

els.debugResizeHandle.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const current = els.debugConsole.getBoundingClientRect().height;
  setDebugHeight(current + (event.key === 'ArrowUp' ? 24 : -24));
});

window.addEventListener('resize', () => {
  const current = els.debugConsole.getBoundingClientRect().height;
  if (current > 0) setDebugHeight(current);
});

// 화면이 가려지면 카메라/프레임을 정리하고, 돌아오면 미리보기를 다시 켠다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.isMeasuring) cancelMeasurement();
    state.previewToken++;
    stopFrameLoop();
    camera.stop();
    state.cameraState = 'idle';
  } else if (!state.isMeasuring) {
    openIdleCamera();
  }
});

function initApp() {
  const parity = validateI18nKeyParity();
  logDebug(`i18n parity check: valid=${parity.valid} (${parity.totalKeys} keys)`);
  applyTranslations();
  sheets.bind();
  syncConfigUI();

  // 페이지 진입 즉시 카메라 미리보기 시작 → 측정 전에 손가락 위치를 잡을 수 있다.
  openIdleCamera();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      logDebug(`SW registration skipped: ${err.message}`);
    });
  }
}

initApp();
