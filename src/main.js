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
import { shareResultAsImage } from './features/share.js';

const RING_CIRCUMFERENCE = 2 * Math.PI * 106;

// 기저 심박수/필터 대역 학습값은 features/storage.js 가 관리합니다.
const initialBaseline = loadCalibrationBaseline();

// 애플리케이션 상태
const state = {
  isMeasuring: false,
  durationSec: 30,
  startTimeMs: 0,
  lastSampleMs: 0,
  lastAdaptiveTickSec: 0,
  rawSamples: [],
  frameHandle: null,
  usingRVFC: false,
  screenLightOn: false,
  simMode: 'camera',
  syntheticPrebuffer: null,
  lastResult: null,
  stealthClicks: 0,
  stealthTimer: null,

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
  screenLightStrip: document.getElementById('screenLightStrip'),
  appTitleTrigger: document.getElementById('appTitleTrigger'),
  btnScreenLight: document.getElementById('btnScreenLight'),
  btnLangToggle: document.getElementById('btnLangToggle'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  panels: {
    measure: document.getElementById('panelMeasure'),
    history: document.getElementById('panelHistory'),
    guide: document.getElementById('panelGuide')
  },
  durBtns: document.querySelectorAll('.dur-btn'),
  cameraSelect: document.getElementById('cameraSelect'),
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
  metricQuality: document.getElementById('metricQuality'),
  metricBeats: document.getElementById('metricBeats'),
  metricCv: document.getElementById('metricCv'),
  metricChannel: document.getElementById('metricChannel'),
  resultBanner: document.getElementById('resultBanner'),
  resultIcon: document.getElementById('resultIcon'),
  resultTitle: document.getElementById('resultTitle'),
  resultDesc: document.getElementById('resultDesc'),
  resultShortNote: document.getElementById('resultShortNote'),
  btnPrimaryMeasure: document.getElementById('btnPrimaryMeasure'),
  btnShareImage: document.getElementById('btnShareImage'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  trendSummaryText: document.getElementById('trendSummaryText'),
  trendCanvas: document.getElementById('trendCanvas'),
  historyList: document.getElementById('historyList'),
  debugConsole: document.getElementById('debugConsole'),
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

function logDebug(msg) {
  const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const line = document.createElement('div');
  line.textContent = `[${timeStr}] ${msg}`;
  els.debugLogList.prepend(line);
  while (els.debugLogList.children.length > 60) {
    els.debugLogList.removeChild(els.debugLogList.lastChild);
  }
}

// 카메라 제어(스트림/토치/장치 목록)는 features/camera.js 로 분리
const camera = createCameraController({
  videoEl: els.cameraVideo,
  selectEl: els.cameraSelect,
  log: (msg) => logDebug(msg),
  onNoTorch: () => showAlert(t('error.webcam.notice'))
});

/**
 * 프레임 콜백과 카메라 스트림을 함께 정리한다.
 * (rVFC 와 rAF 중 어떤 방식으로 예약됐는지에 따라 취소 API 가 다르다)
 */
function stopCameraAndFrames() {
  if (state.frameHandle) {
    if (state.usingRVFC && els.cameraVideo.cancelVideoFrameCallback) {
      els.cameraVideo.cancelVideoFrameCallback(state.frameHandle);
    } else {
      cancelAnimationFrame(state.frameHandle);
    }
    state.frameHandle = null;
  }
  camera.stop();
}

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

function applyTranslations() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  els.btnScreenLight.textContent = state.screenLightOn
    ? t('app.header.screenLightOn')
    : t('app.header.screenLight');

  if (state.isMeasuring) {
    els.btnPrimaryMeasure.textContent = t('measure.cta.stop');
  } else if (state.lastResult) {
    els.btnPrimaryMeasure.textContent = t('measure.cta.remeasure');
    renderResultBanner(state.lastResult);
  } else {
    els.btnPrimaryMeasure.textContent = t('measure.cta.start');
  }
  updateCalibBannerUI();
  renderHistory();
  document.body.classList.add('i18n-ready');
}

function setScreenLight(enabled) {
  state.screenLightOn = Boolean(enabled);
  els.screenLightStrip.classList.toggle('active', state.screenLightOn);
  els.btnScreenLight.textContent = state.screenLightOn
    ? t('app.header.screenLightOn')
    : t('app.header.screenLight');
  logDebug(`Screen light Strip: ${state.screenLightOn ? 'ON' : 'OFF'}`);
}

window.camera = { setScreenLight };

function showAlert(msg) {
  els.liveAlertBox.textContent = msg;
  els.liveAlertBox.classList.add('visible');
}

function hideAlert() {
  els.liveAlertBox.textContent = '';
  els.liveAlertBox.classList.remove('visible');
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

      els.metricChannel.textContent = sample.channel;

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
      els.metricChannel.textContent = 'SIM';
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
        els.metricQuality.textContent = `${liveAnalysis.qualityScore}%`;
        els.metricBeats.textContent = String(liveAnalysis.beatCount);
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

async function startMeasurement() {
  if (state.isMeasuring) {
    cancelMeasurement();
    return;
  }

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
  state.lastAdaptiveTickSec = 0;
  state.lastResult = null;
  els.resultBanner.classList.remove('visible');
  els.btnShareImage.style.display = 'none';
  els.bpmNumber.textContent = '--';
  els.metricQuality.textContent = '--';
  els.metricBeats.textContent = '0';
  els.metricCv.textContent = '--';
  updateProgressRing(0);
  updateCalibBannerUI();

  if (state.simMode === 'camera') {
    try {
      const { torchEnabled } = await camera.open();
      if (torchEnabled) hideAlert();
    } catch (err) {
      logDebug(`Camera open error: ${err.name} - ${err.message}`);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showAlert(t('error.camera.denied'));
      } else {
        showAlert(t('error.camera.notFound'));
      }
      return;
    }
  } else {
    prepareSimulationSignal();
    hideAlert();
  }

  state.isMeasuring = true;
  state.startTimeMs = performance.now();
  state.lastSampleMs = state.startTimeMs;
  els.heartBeatIcon.classList.add('beating');
  els.btnPrimaryMeasure.classList.add('measuring');
  els.btnPrimaryMeasure.textContent = t('measure.cta.stop');
  playTone(480, 100);
  logDebug(
    `Measurement started (${state.durationSec}s, mode=${state.simMode}, priorBPM=${state.priorBpm})`
  );

  scheduleNextFrame();
}

function cancelMeasurement() {
  state.isMeasuring = false;
  stopCameraAndFrames();
  els.heartBeatIcon.classList.remove('beating');
  els.btnPrimaryMeasure.classList.remove('measuring');
  els.btnPrimaryMeasure.textContent = t('measure.cta.start');
  els.stageGuideText.textContent = t('measure.status.readyTitle');
  els.timerBadge.textContent = formatTimer(state.durationSec);
  updateProgressRing(0);
  updateCalibBannerUI();
  logDebug('Measurement cancelled by user.');
}

function finishMeasurement() {
  state.isMeasuring = false;
  stopCameraAndFrames();
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
  els.bpmNumber.textContent = formatNumber(record.bpm);
  els.metricQuality.textContent = `${record.quality}%`;
  els.metricBeats.textContent = String(record.beatCount);
  els.metricCv.textContent = String(record.cv);
  els.stageGuideText.textContent = t('measure.status.completed');

  updateCalibBannerUI();
  renderResultBanner(record);
  saveRecordToHistory(record);
  els.btnShareImage.style.display = 'inline-flex';
  logDebug(
    `Measurement completed: BPM=${record.bpm}, status=${record.status}, CV=${record.cv}, saved to 30-run baseline.`
  );
}

// 결과 배지 아이콘: 이모지는 기기/폰트에 따라 다르게 보이거나 사라질 수 있어 SVG 로 고정한다.
// (색만으로 상태를 전달하지 않는다는 원칙 — 색 + 아이콘 + 문구를 함께 사용)
const SVG_CHECK = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M6.8 12.4l3.4 3.4 7-7.2" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_DOWN = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.5v11M7.5 13l4.5 4.5 4.5-4.5" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_UP = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 17.5v-11M7.5 11L12 6.5 16.5 11" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_ALERT = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.8v7.4" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.6" fill="#FFFFFF"/></svg>';

const RESULT_ICONS = {
  normal: SVG_CHECK,
  brady: SVG_DOWN,
  tachy: SVG_UP,
  irregular: SVG_ALERT
};

function renderResultBanner(record) {
  els.resultBanner.className = `result-banner visible status-${record.status}`;
  els.resultIcon.innerHTML = RESULT_ICONS[record.status] || RESULT_ICONS.normal;
  els.resultTitle.textContent = t(`result.${record.status}.title`);
  els.resultDesc.textContent = t(`result.${record.status}.desc`);
  els.resultShortNote.style.display = record.isShortMeasurement ? 'block' : 'none';
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
    const statusTitle = t(`result.${item.status}.title`);
    li.innerHTML = `
      <div>
        <div style="font-weight:800; font-size:1.05rem;">${statusTitle}</div>
        <div style="font-size:0.88rem; color:var(--text-sub);">${formatDateTime(item.timestamp)} · ${item.duration}s · CV ${item.cv}</div>
      </div>
      <div class="history-bpm">${formatNumber(item.bpm)}<span class="unit">${t('measure.unit.bpm')}</span></div>
    `;
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
    ctx.fillStyle = rec.status === 'normal' ? '#10B981' : '#E11D48';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 이벤트 바인딩 (5-7절 원칙: click 이벤트 일원화)
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

els.btnScreenLight.addEventListener('click', () => {
  setScreenLight(!state.screenLightOn);
});

els.tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    els.tabBtns.forEach((b) => {
      const isMatch = b === btn;
      b.classList.toggle('active', isMatch);
      b.setAttribute('aria-selected', String(isMatch));
    });
    Object.entries(els.panels).forEach(([key, panel]) => {
      panel.classList.toggle('active', key === targetTab);
    });
  });
});

els.durBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.isMeasuring) return;
    state.durationSec = Number(btn.getAttribute('data-duration'));
    els.durBtns.forEach((b) => b.classList.toggle('active', b === btn));
    els.timerBadge.textContent = formatTimer(state.durationSec);
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

function initApp() {
  const parity = validateI18nKeyParity();
  logDebug(`i18n parity check: valid=${parity.valid} (${parity.totalKeys} keys)`);
  applyTranslations();
  camera.populateCameraList();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      logDebug(`SW registration skipped: ${err.message}`);
    });
  }
}

initApp();