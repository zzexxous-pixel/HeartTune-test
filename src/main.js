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
  formatHistoryDateTime,
  validateI18nKeyParity
} from './i18n.js';
import {
  loadHistory,
  appendRecordToHistory,
  deleteHistoryById,
  clearStoredData,
  loadCalibrationBaseline,
  saveCalibrationSample
} from './features/storage.js';
import { createCameraController } from './features/camera.js';
import { getHistoryPresentation } from './features/result-indicators.js';
import { createSheetController } from './features/sheets.js';
import { shareResultAsImage, downloadResultAsImage } from './features/share.js';
import { buildDetailViewModel } from './features/detail-view.js';

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
  btnSaveImage: document.getElementById('btnSaveImage'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  btnDetailsShare: document.getElementById('btnDetailsShare'),
  btnDetailsSave: document.getElementById('btnDetailsSave'),
  historyUndoToast: document.getElementById('historyUndoToast'),
  btnUndoDelete: document.getElementById('btnUndoDelete'),
  btnHistoryBack: document.getElementById('btnHistoryBack'),
  btnHistoryDetailShare: document.getElementById('btnHistoryDetailShare'),
  btnHistoryDetailSave: document.getElementById('btnHistoryDetailSave'),
  btnHistoryDetailDelete: document.getElementById('btnHistoryDetailDelete'),
  historyDetailBody: document.getElementById('historyDetailBody'),
  historyAdSlot: document.getElementById('historyAdSlot'),
  historyCount: document.getElementById('historyCount'),
  trendStats: document.getElementById('trendStats'),
  trendYAxis: document.getElementById('trendYAxis'),
  trendScroll: document.getElementById('trendScroll'),
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
  onOpen: (sheet) => {
    logDebug(`Sheet opened: ${sheet.id}`);
    onNavSheetOpened(sheet);
  },
  onClose: (sheet) => {
    logDebug(`Sheet closed: ${sheet.id}`);
    if (sheet === els.historySheet) onHistorySheetClosed();
    onNavSheetClosed(sheet);
  },
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
  // 첫 방문 손가락 와이어 이미지를 카메라 설정(전면/후면)에 맞게 바꾼다.
  document.body.classList.toggle('cam-front', state.facingMode === 'user');
}

/** 처음 접속(저장된 이력도 결과도 없음)인 동안 메시지 영역에 손가락 위치 와이어를 보여준다. */
function updateFirstRunState() {
  const firstRun = !state.lastResult && loadHistory().length === 0;
  document.body.classList.toggle('is-first-run', firstRun);
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
  document.querySelectorAll('[data-i18n-href]').forEach((el) => {
    el.setAttribute('href', t(el.getAttribute('data-i18n-href')));
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
  updateFirstRunState();
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
  drawWaveformValues(state.rawSamples.slice(-90).map((pt) => pt.v));
}

/** 파형 값 배열을 메인 파형 캔버스에 그린다. (실시간 측정 · 이력 다시 보기 공용) */
function drawWaveformValues(values) {
  const w = els.waveformCanvas.width;
  const h = els.waveformCanvas.height;
  waveCtx.clearRect(0, 0, w, h);

  // 어두운 모니터 카드용 격자 (가로 4등분 · 세로 6등분)
  waveCtx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  waveCtx.lineWidth = 1;
  waveCtx.beginPath();
  for (let i = 1; i < 4; i++) {
    waveCtx.moveTo(0, (h / 4) * i);
    waveCtx.lineTo(w, (h / 4) * i);
  }
  for (let i = 1; i < 6; i++) {
    waveCtx.moveTo((w / 6) * i, 0);
    waveCtx.lineTo((w / 6) * i, h);
  }
  waveCtx.stroke();

  const recent = values;
  if (recent.length < 3) return;

  let minV = Infinity;
  let maxV = -Infinity;
  for (const v of recent) {
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const range = Math.max(0.8, maxV - minV);

  waveCtx.strokeStyle = '#FF5A6A';
  waveCtx.lineWidth = 3;
  waveCtx.shadowColor = 'rgba(255, 90, 106, 0.45)';
  waveCtx.shadowBlur = 7;
  waveCtx.lineJoin = 'round';
  waveCtx.beginPath();

  recent.forEach((v, idx) => {
    const x = (idx / (recent.length - 1)) * (w - 16) + 8;
    const normY = (v - minV) / range;
    const y = h - 10 - normY * (h - 20);
    if (idx === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  });
  waveCtx.stroke();
  waveCtx.shadowBlur = 0;
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
  els.btnSaveImage.hidden = true;
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
  els.btnSaveImage.hidden = true;
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

  // Keep the exact recent raw samples used by the live canvas so details/share show the same trace.
  const wfSummary = state.rawSamples.slice(-90).map((point) => Number(point.v.toFixed(4)));

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
  els.btnSaveImage.hidden = false;
  updateFirstRunState();
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

function renderResultIndicators(model, root = els.detailsSheet) {
  model.indicators.forEach((ind) => {
    const card = root.querySelector(`[data-indicator="${ind.key}"]`);
    if (!card) return;
    card.classList.toggle('is-active', ind.tone === 'active');
    card.classList.toggle('is-clear', ind.tone === 'clear');
    if (ind.key === 'signal-quality') {
      card.classList.remove('quality-good', 'quality-fair', 'quality-poor', 'quality-unknown');
      card.classList.add(`quality-${ind.quality}`);
    }
    card.setAttribute('aria-label', `${ind.label}: ${ind.state}`);
    card.querySelector('[data-indicator-state]').textContent = ind.state;
  });
}

function drawDetailsWaveform(values, root = els.detailsSheet) {
  const canvas = root.querySelector('[data-role="waveform"]');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#090D16';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(0, (height / 4) * i);
    ctx.lineTo(width, (height / 4) * i);
  }
  for (let i = 1; i < 6; i++) {
    ctx.moveTo((width / 6) * i, 0);
    ctx.lineTo((width / 6) * i, height);
  }
  ctx.stroke();

  const waveform = values;
  if (waveform.length < 2) return;
  const min = Math.min(...waveform);
  const max = Math.max(...waveform);
  const range = Math.max(0.8, max - min);
  ctx.strokeStyle = '#FF5A6A';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255, 90, 106, 0.45)';
  ctx.shadowBlur = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  waveform.forEach((value, index) => {
    const x = 8 + (index / (waveform.length - 1)) * (width - 16);
    const y = height - 10 - ((value - min) / range) * (height - 20);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** 상세 화면 뷰모델: 측정 결과 상세·이력 상세·공유 이미지가 함께 쓰는 단일 소스. */
function buildViewModel(record) {
  return buildDetailViewModel(record, { t, formatDateTime: formatHistoryDateTime, formatNumber });
}

/** 측정 상세 내용을 root(측정 상세 시트 또는 이력 자세히 보기) 안에 채운다. */
function renderDetails(record, root = els.detailsSheet) {
  if (!record) return;
  const model = buildViewModel(record);
  root.querySelector('[data-role="date"]').textContent = model.meta[0].value;
  root.querySelector('[data-role="duration"]').textContent = model.meta[1].value;
  root.querySelector('[data-role="bpm"]').textContent = model.bpm.value;
  drawDetailsWaveform(model.waveform.values, root);
  renderResultIndicators(model, root);
}

function renderResultBanner(record) {
  els.resultBanner.className = `result-banner visible status-${record.status}`;
  els.resultIcon.innerHTML = RESULT_ICONS[record.status] || RESULT_ICONS.normal;
  const presentation = getHistoryPresentation(record);
  els.resultTitle.textContent = presentation.signals.length
    ? t('result.signals.summary', {
      signals: presentation.signals.map((name) => t(`measure.indicator.${name}`)).join(', ')
    })
    : t(`result.${record.status}.title`);
  els.resultDesc.textContent = t(`result.${record.status}.desc`);
  els.resultShortNote.hidden = !record.isShortMeasurement;
  renderResultIndicators(buildViewModel(record));
}

function saveRecordToHistory(record) {
  try {
    appendRecordToHistory(record);
    renderHistory();
  } catch (err) {
    logDebug(`localStorage save error: ${err.message}`);
  }
}

/* --------------------------------------------------------------------------
   측정이력 시트: 그래프(고정 Y축 + 가로 스크롤 X축) · 상세 목록 · 하단 광고 영역
   -------------------------------------------------------------------------- */
const SVG_NS = 'http://www.w3.org/2000/svg';
const TREND = {
  height: 118,      // CSS 높이와 동일 (viewBox 단위 = px). 통계 스트립 추가 후 목록 가시 영역 확보를 위해 축소
  plotTop: 18,      // 상단 단위(회/분) 표시 공간
  plotBottom: 22,   // 하단 날짜 라벨 공간
  yAxisWidth: 40,
  padX: 24,
  pointGap: 46      // 측정 1건당 X축 간격(px) → 많으면 가로 스크롤
};
const SWIPE_MAX_PX = 96;   // 삭제 버튼 폭
const SWIPE_OPEN_PX = 48;  // 이 이상 밀면 삭제 버튼이 열린 상태로 고정

/** 추세 선을 Catmull-Rom → 3차 베지어로 부드럽게 이어 그린다. (y는 플롯 영역을 벗어나지 않게 가둔다) */
function smoothTrendPath(pts, minY, maxY) {
  const clamp = (v) => Math.max(minY, Math.min(maxY, v));
  const f = (v) => Number(v.toFixed(1));
  let d = `M ${f(pts[0].x)} ${f(clamp(pts[0].y))}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(clamp(p2.y))}`;
  }
  return d;
}

function svgNode(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== null) node.textContent = text;
  return node;
}

/** Y축 범위: 기존 표시 기준(50~110)을 기본으로 두고, 데이터가 벗어나면 넓힌다. */
function getTrendRange(records) {
  const bpms = records.map((r) => Number(r.bpm)).filter((v) => Number.isFinite(v));
  const minB = bpms.length ? Math.min(...bpms) : 60;
  const maxB = bpms.length ? Math.max(...bpms) : 100;
  const lo = Math.min(50, Math.floor((minB - 5) / 10) * 10);
  const hi = Math.max(110, Math.ceil((maxB + 5) / 10) * 10);
  const step = hi - lo > 80 ? 20 : 10;
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

/** records 는 오래된 순(왼쪽 → 오른쪽). */
function drawTrendChart(records) {
  const H = TREND.height;
  const plotH = H - TREND.plotTop - TREND.plotBottom;
  const { lo, hi, ticks } = getTrendRange(records);
  const yOf = (bpm) => TREND.plotTop + (1 - (bpm - lo) / (hi - lo)) * plotH;

  // 1) 고정 Y축 (눈금 숫자 + 단위)
  els.trendYAxis.replaceChildren();
  els.trendYAxis.setAttribute('width', TREND.yAxisWidth);
  els.trendYAxis.setAttribute('height', H);
  els.trendYAxis.setAttribute('viewBox', `0 0 ${TREND.yAxisWidth} ${H}`);
  els.trendYAxis.appendChild(svgNode('text', {
    x: TREND.yAxisWidth - 4, y: 12, 'text-anchor': 'end', class: 'trend-unit'
  }, t('measure.unit.bpm')));
  ticks.forEach((v) => {
    els.trendYAxis.appendChild(svgNode('text', {
      x: TREND.yAxisWidth - 4, y: yOf(v) + 4, 'text-anchor': 'end', class: 'trend-tick'
    }, String(v)));
  });

  // 2) 스크롤 캔버스: 가로 그리드 + 점/선 + X축 날짜(M/D)
  const n = records.length;
  const containerW = els.trendScroll.clientWidth || 260;
  const viewW = Math.max(containerW, TREND.padX * 2 + Math.max(0, n - 1) * TREND.pointGap);
  const xOf = (i) => (n === 1 ? viewW / 2 : TREND.padX + i * TREND.pointGap);

  els.trendCanvas.replaceChildren();
  els.trendCanvas.setAttribute('width', viewW);
  els.trendCanvas.setAttribute('height', H);
  els.trendCanvas.setAttribute('viewBox', `0 0 ${viewW} ${H}`);

  // 일반 참고 범위(60~100 회/분) 밴드 — 표시 기준을 바꾸지 않고 배경으로만 보여준다.
  if (hi >= 60 && lo <= 100) {
    const bandTop = yOf(Math.min(100, hi));
    const bandBottom = yOf(Math.max(60, lo));
    els.trendCanvas.appendChild(svgNode('rect', {
      x: 0, y: bandTop, width: viewW, height: Math.max(0, bandBottom - bandTop), class: 'trend-normal-band'
    }));
  }

  ticks.forEach((v) => {
    els.trendCanvas.appendChild(svgNode('line', {
      x1: 0, x2: viewW, y1: yOf(v), y2: yOf(v), class: 'trend-grid'
    }));
  });

  if (n > 1) {
    const pts = records.map((r, i) => ({ x: xOf(i), y: yOf(Number(r.bpm)) }));
    els.trendCanvas.appendChild(svgNode('path', {
      d: smoothTrendPath(pts, TREND.plotTop, H - TREND.plotBottom),
      class: 'trend-line'
    }));
  }

  records.forEach((rec, i) => {
    const d = new Date(rec.timestamp);
    const x = xOf(i);
    els.trendCanvas.appendChild(svgNode('text', {
      x, y: H - 6, 'text-anchor': 'middle', class: 'trend-date'
    }, `${d.getMonth() + 1}/${d.getDate()}`));
    const abnormal = getHistoryPresentation(rec).isAbnormal;
    els.trendCanvas.appendChild(svgNode('circle', {
      cx: x, cy: yOf(Number(rec.bpm)), r: 5.5,
      class: abnormal ? 'trend-dot is-abnormal' : 'trend-dot is-normal'
    }));
  });

  // 최신 측정이 보이도록 오른쪽 끝으로 스크롤
  els.trendScroll.scrollLeft = els.trendScroll.scrollWidth;
}

function closeOpenHistoryRows(except = null) {
  els.historyList.querySelectorAll('.history-item.is-open').forEach((node) => {
    if (node !== except) node.classList.remove('is-open');
  });
}

/* ── 측정이력: 목록 · 자세히 보기(같은 시트 안 화면 전환) · 삭제 대기(실행 취소) ── */

const UNDO_DELETE_MS = 3000; // 삭제 후 이 시간 안에 취소하지 않으면 실제로 지운다

/** 화면 상태. detailRecord 가 있으면 "자세히 보기" 화면, pendingId 는 삭제 대기 중인 기록. */
const historyView = {
  detailRecord: null,
  pendingId: null,
  pendingTimer: null
};

/** 목록 한 줄: 탭 = 자세히 보기, 왼쪽으로 밀기 = 삭제 버튼(끝까지 밀면 바로 삭제 대기) */
function buildHistoryItem(item) {
  const presentation = getHistoryPresentation(item);
  const li = document.createElement('li');
  li.className = 'history-item';

  const row = document.createElement('div');
  row.className = 'history-row';
  row.setAttribute('role', 'button');
  row.tabIndex = 0;

  const main = document.createElement('div');
  main.className = 'history-main';
  const signalText = document.createElement('div');
  signalText.className = `history-signals ${presentation.isAbnormal ? 'is-abnormal' : 'is-normal'}`;
  signalText.textContent = presentation.isAbnormal
    ? t('history.status.suspected', {
      signals: presentation.signals.map((name) => t(`measure.indicator.${name}`)).join(', ')
    })
    : t('history.status.normal');
  const meta = document.createElement('div');
  meta.className = 'history-meta';
  meta.textContent = `${formatHistoryDateTime(item.timestamp)} · ${t('details.duration.value', { seconds: item.duration })}`;
  main.append(signalText, meta);

  const bpm = document.createElement('div');
  bpm.className = `history-bpm${presentation.abnormalRate ? ' is-abnormal-rate' : ''}`;
  bpm.append(document.createTextNode(formatNumber(item.bpm)));
  const unit = document.createElement('span');
  unit.className = 'unit';
  unit.textContent = t('measure.unit.bpm');
  bpm.append(unit);

  const chevron = document.createElement('span');
  chevron.className = 'history-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';

  row.append(main, bpm, chevron);
  row.setAttribute('aria-label', `${signalText.textContent}, ${formatNumber(item.bpm)} ${t('measure.unit.bpm')}, ${meta.textContent}. ${t('history.item.replay')}`);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'history-delete';
  delBtn.textContent = t('history.action.delete');
  delBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    scheduleDelete(item);
  });

  // 가로 스와이프 제스처 (Pointer Events — 탭은 click 으로만 처리)
  let drag = null;
  let suppressClick = false;
  row.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, active: false, wasOpen: li.classList.contains('is-open') };
  });
  row.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      drag.active = true;
      row.setPointerCapture(event.pointerId);
      closeOpenHistoryRows(li);
      row.classList.add('is-dragging');
      li.classList.add('is-swiping'); // 드래그 중에도 빨간 삭제 버튼이 보이도록
    }
    drag.dx = dx;
    const base = drag.wasOpen ? -SWIPE_MAX_PX : 0;
    const offset = Math.max(-SWIPE_MAX_PX, Math.min(0, base + dx));
    row.style.transform = `translateX(${offset}px)`;
  });
  const endDrag = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { active, dx, wasOpen } = drag;
    drag = null;
    row.classList.remove('is-dragging');
    row.style.transform = '';
    li.classList.remove('is-swiping');
    if (!active) return;
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 300);
    const position = (wasOpen ? -SWIPE_MAX_PX : 0) + dx;
    if (position <= -SWIPE_MAX_PX + 1) {
      // 끝까지 밀었을 때만 삭제 대기 (중간에 놓으면 삭제하지 않는다)
      li.classList.remove('is-open');
      scheduleDelete(item);
      return;
    }
    // 완전히 밀지 않고 놓으면 항상 닫힌다 (삭제 안 함, 삭제 버튼이 남지 않음)
    li.classList.remove('is-open');
  };
  row.addEventListener('pointerup', endDrag);
  row.addEventListener('pointercancel', endDrag);

  row.addEventListener('click', () => {
    if (suppressClick) return;
    if (li.classList.contains('is-open')) {
      li.classList.remove('is-open');
      return;
    }
    openHistoryDetail(item);
  });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      row.click();
    }
  });

  li.append(row, delBtn);
  return li;
}

/** 삭제 대기 중인 기록은 목록·그래프에서 숨긴다. */
function getVisibleHistory() {
  return loadHistory().filter((record) => record.id !== historyView.pendingId);
}

function renderHistory() {
  const list = getVisibleHistory(); // 최신순
  els.btnClearHistory.disabled = list.length === 0;
  drawTrendChart(list.slice().reverse());

  // 저장 건수와 최저/평균/최고 요약 (실측 기록에서만 계산하는 사실 정보)
  els.historyCount.textContent = t('history.header.count', { count: formatNumber(list.length) });
  const bpms = list.map((record) => Number(record.bpm)).filter((value) => Number.isFinite(value));
  els.trendStats.hidden = bpms.length === 0;
  if (bpms.length > 0) {
    const stats = {
      min: Math.min(...bpms),
      avg: Math.round(bpms.reduce((sum, value) => sum + value, 0) / bpms.length),
      max: Math.max(...bpms)
    };
    Object.entries(stats).forEach(([name, value]) => {
      els.trendStats.querySelector(`[data-trend-stat="${name}"]`).textContent = formatNumber(value);
    });
  }

  els.historyList.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = t('history.empty.text');
    els.historyList.appendChild(empty);
    return;
  }
  list.forEach((item) => els.historyList.appendChild(buildHistoryItem(item)));
}

/* ── 삭제 대기 · 실행 취소 ─────────────────────────────────────────────── */

function placeUndoToast() {
  // 광고 영역 바로 위에 띄운다 (광고 높이가 바뀌어도 따라감)
  els.historyUndoToast.style.bottom = `${els.historyAdSlot.offsetHeight + 12}px`;
}

function showUndoToast() {
  els.historyUndoToast.hidden = false;
  placeUndoToast();
}

function hideUndoToast() {
  els.historyUndoToast.hidden = true;
}

/** 대기 중인 삭제를 실제로 저장소에서 지운다. (타이머 만료, 시트 닫힘, 다른 삭제 시작 시) */
function commitPendingDelete() {
  if (historyView.pendingId == null) return;
  window.clearTimeout(historyView.pendingTimer);
  deleteHistoryById(historyView.pendingId);
  historyView.pendingId = null;
  historyView.pendingTimer = null;
  hideUndoToast();
}

/** 기록을 목록에서 숨기고 3초 뒤 실제로 삭제한다. 그 사이 [삭제 취소]로 복구할 수 있다. */
function scheduleDelete(record) {
  commitPendingDelete();
  historyView.pendingId = record.id;
  historyView.pendingTimer = window.setTimeout(() => {
    commitPendingDelete();
    renderHistory();
  }, UNDO_DELETE_MS);
  showUndoToast();
  renderHistory();
}

function undoPendingDelete() {
  if (historyView.pendingId == null) return;
  window.clearTimeout(historyView.pendingTimer);
  historyView.pendingId = null;
  historyView.pendingTimer = null;
  hideUndoToast();
  renderHistory();
}

/** 전체 삭제처럼 저장소를 통째로 지우는 경우: 대기 중인 삭제는 따로 실행하지 않고 취소한다. */
function cancelPendingDelete() {
  window.clearTimeout(historyView.pendingTimer);
  historyView.pendingId = null;
  historyView.pendingTimer = null;
  hideUndoToast();
}

/* ── 자세히 보기 (같은 시트 안에서 왼쪽으로 밀려 들어오는 화면) ────────── */

function buildHistoryDetailBody() {
  // 측정 상세 시트의 본문을 복제해 쓴다. 중복 id 를 피하려고 id 는 모두 제거하고,
  // 값 채우기는 data-role / data-indicator 속성으로 찾는다.
  const copy = els.detailsSheet.querySelector('.details-body').cloneNode(true);
  copy.removeAttribute('id');
  copy.classList.remove('sheet-body');
  copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  els.historyDetailBody.appendChild(copy);
}

function openHistoryDetail(record) {
  historyView.detailRecord = record;
  renderDetails(record, els.historyDetailBody);
  els.historyDetailBody.parentElement.scrollTop = 0;
  els.historySheet.classList.add('is-detail');
  pushNavLayer('detail');
}

/** 화면만 자세히 보기 → 목록으로 되돌린다 (history 는 건드리지 않음). */
function closeHistoryDetailView() {
  historyView.detailRecord = null;
  els.historySheet.classList.remove('is-detail');
}

/** 사용자가 뒤로가기 버튼을 눌렀을 때: 자세히 보기를 닫고 쌓인 history 항목도 되돌린다. */
function leaveHistoryDetail() {
  if (!historyView.detailRecord) return;
  closeHistoryDetailView();
  const index = navLayers.lastIndexOf('detail');
  if (index !== -1) dropNavLayers(navLayers.length - index);
}

/** 시트가 닫힐 때: 대기 중인 삭제를 마무리하고 자세히 보기를 목록으로 되돌린다. */
function onHistorySheetClosed() {
  commitPendingDelete();
  closeHistoryDetailView();
}

/* ── 브라우저 뒤로가기 ───────────────────────────────────────────────────
 * 열린 시트·자세히 보기마다 history 항목 하나를 쌓는다.
 *  · 뒤로가기 → 가장 위 화면을 닫는다 (시트 → 메인, 자세히 보기 → 목록).
 *  · 메인 화면에서 뒤로가기 → 앱 주소로 다시 열어 초기 화면으로 간다 (앱 밖으로 나가지 않음).
 * ─────────────────────────────────────────────────────────────────────── */

const APP_URL = location.href.split('#')[0];
const navLayers = []; // 'sheet:<id>' 또는 'detail'
let navSilentPops = 0; // 우리가 history.go() 로 되돌린 popstate 를 무시하는 횟수
let navClosingFromHistory = false; // 뒤로가기로 시트를 닫는 중에는 history 를 다시 건드리지 않음

function pushNavLayer(name) {
  navLayers.push(name);
  history.pushState({ htLayer: navLayers.length }, '', APP_URL);
}

/** 화면을 버튼·배경·ESC 로 닫았을 때 그 화면 위의 history 항목을 함께 되돌린다. */
function dropNavLayers(count) {
  if (count <= 0) return;
  navLayers.splice(navLayers.length - count, count);
  navSilentPops += 1;
  history.go(-count);
}

function onNavSheetOpened(sheet) {
  const top = navLayers[navLayers.length - 1];
  if (top && top.startsWith('sheet:')) {
    navLayers[navLayers.length - 1] = `sheet:${sheet.id}`; // 시트 → 시트 전환은 history 항목을 재사용
  } else {
    pushNavLayer(`sheet:${sheet.id}`);
  }
}

function onNavSheetClosed(sheet) {
  if (navClosingFromHistory) return;
  const index = navLayers.indexOf(`sheet:${sheet.id}`);
  if (index !== -1) dropNavLayers(navLayers.length - index);
}

window.addEventListener('popstate', () => {
  if (navSilentPops > 0) {
    navSilentPops -= 1;
    return;
  }
  if (navLayers.length === 0) {
    location.replace(APP_URL); // 메인에서 뒤로가기: 초기 화면으로 다시 연다
    return;
  }
  const top = navLayers.pop();
  if (top === 'detail') {
    closeHistoryDetailView();
    return;
  }
  navClosingFromHistory = true;
  try {
    sheets.close();
  } finally {
    navClosingFromHistory = false;
  }
});

function shareRecord(record) {
  if (!record) return;
  shareResultAsImage(record, { t, formatDateTime: formatHistoryDateTime, formatNumber });
}

/** 공유 시트를 거치지 않고 결과 이미지를 바로 내려받는다. */
function downloadRecord(record) {
  if (!record) return;
  downloadResultAsImage(record, { t, formatDateTime: formatHistoryDateTime, formatNumber });
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

els.btnShareImage.addEventListener('click', () => shareRecord(state.lastResult));
els.btnSaveImage.addEventListener('click', () => downloadRecord(state.lastResult));
els.btnDetailsShare.addEventListener('click', () => shareRecord(state.lastResult));
els.btnDetailsSave.addEventListener('click', () => downloadRecord(state.lastResult));
els.btnHistoryDetailShare.addEventListener('click', () => shareRecord(historyView.detailRecord));
els.btnHistoryDetailSave.addEventListener('click', () => downloadRecord(historyView.detailRecord));

els.btnUndoDelete.addEventListener('click', () => undoPendingDelete());
els.btnHistoryBack.addEventListener('click', () => leaveHistoryDetail());
els.btnHistoryDetailDelete.addEventListener('click', () => {
  const record = historyView.detailRecord;
  if (!record) return;
  leaveHistoryDetail();
  scheduleDelete(record);
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
  closeHistoryDetailView();
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
  if (loadHistory().length === 0) return;
  if (!window.confirm(t('history.confirm.clearAll'))) return;
  cancelPendingDelete();
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
   바텀시트 손잡이 드래그 — 손잡이를 잡고 아래로 끌면 시트가 따라 내려간다.
   충분히 끌었거나 휙 던지면 닫히고, 살짝만 끌었으면 제자리로 돌아온다.
   -------------------------------------------------------------------------- */
document.querySelectorAll('.sheet-grab').forEach((handle) => {
  const sheet = handle.closest('.sheet');
  let drag = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag = { id: event.pointerId, startY: event.clientY, dy: 0, lastY: event.clientY, lastT: performance.now(), velocity: 0 };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (_) {
      // 무시
    }
    sheet.classList.add('is-dragging');
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const now = performance.now();
    if (now > drag.lastT) {
      drag.velocity = (event.clientY - drag.lastY) / (now - drag.lastT); // px/ms
      drag.lastY = event.clientY;
      drag.lastT = now;
    }
    drag.dy = Math.max(0, event.clientY - drag.startY);
    sheet.style.transform = `translate(-50%, ${drag.dy}px)`;
  });

  const endDrag = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { dy, velocity } = drag;
    drag = null;
    sheet.classList.remove('is-dragging');
    const shouldClose = dy > 110 || (dy > 40 && velocity > 0.7);
    if (shouldClose) {
      // 손을 뗀 위치에서 아래로 슬라이드하며 닫힌다.
      sheet.style.transform = 'translate(-50%, 105%)';
      window.setTimeout(() => {
        sheet.style.transform = '';
        sheets.close();
      }, 210);
    } else {
      sheet.style.transform = '';
    }
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
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
  history.replaceState({ htRoot: true }, '', APP_URL);
  history.pushState({ htGuard: true }, '', APP_URL);
  buildHistoryDetailBody();
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
