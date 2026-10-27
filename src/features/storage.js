/**
 * src/features/storage.js
 * 오늘심박 (HeartTune) — 브라우저 로컬 저장소 계층
 *
 * 서버가 없는 앱이므로 측정 이력과 캘리브레이션(기저 심박수) 학습 데이터를
 * localStorage 에만 보관한다. (브라우저 로컬 저장 / 오프라인 동작)
 *
 *  · hearttune_history_v1     : 측정 이력 (최대 100건)
 *  · hearttune_calibration_v1 : 신뢰도 높은 측정의 필터 대역 (최근 30건)
 *                               → 다음 측정의 priorBpm(구명조끼 대역) 으로 사용
 *  · hearttune_settings_v1    : 사용자 설정 (측정 시간·카메라 방향) — 재접속 시 유지
 */

export const HISTORY_STORAGE_KEY = 'hearttune_history_v1';
export const CALIB_STORAGE_KEY = 'hearttune_calibration_v1';
export const SETTINGS_STORAGE_KEY = 'hearttune_settings_v1';
export const MAX_HISTORY_ITEMS = 100;
export const MAX_CALIB_ITEMS = 30;

const DEFAULT_BASELINE = { priorBpm: 72, avgHp: 0.7, avgLp: 4.0, count: 0 };

/** localStorage 접근이 차단된 환경(사생활 보호 모드 등)에서도 앱이 죽지 않도록 방어 */
function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}

function readJsonList(key) {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/* ── 측정 이력 ─────────────────────────────────────────────────────────── */

export function loadHistory() {
  return readJsonList(HISTORY_STORAGE_KEY);
}

/** 최신 기록을 맨 앞에 추가하고 MAX_HISTORY_ITEMS 개로 잘라 저장한다. */
export function appendRecordToHistory(record) {
  const storage = getStorage();
  const list = loadHistory();
  list.unshift(record);
  const trimmed = list.slice(0, MAX_HISTORY_ITEMS);
  if (storage) {
    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (_) {
      // 용량 초과 등은 조용히 무시 (앱 동작 우선)
    }
  }
  return trimmed;
}

/** id 가 일치하는 측정 기록 하나를 삭제하고, 삭제 후 최신순 목록을 반환한다. */
export function deleteHistoryById(id) {
  const storage = getStorage();
  const list = loadHistory().filter((record) => record.id !== id);
  if (storage) {
    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {
      // 무시
    }
  }
  return list;
}

/** 이력 + 캘리브레이션 학습 데이터를 모두 삭제한다. (측정이력 휴지통 버튼에서 사용) */
export function clearStoredData() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
    storage.removeItem(CALIB_STORAGE_KEY);
  } catch (_) {
    // 무시
  }
}

/* ── 적응형 캘리브레이션 학습 ──────────────────────────────────────────── */

/** 최근 30건의 평균 기저 심박수와 평균 필터 대역을 반환한다. */
export function loadCalibrationBaseline() {
  const list = readJsonList(CALIB_STORAGE_KEY);
  if (list.length === 0) return { ...DEFAULT_BASELINE };

  const sumBpm = list.reduce((acc, item) => acc + (item.bpm || 72), 0);
  const sumHp = list.reduce((acc, item) => acc + (item.hp || 0.7), 0);
  const sumLp = list.reduce((acc, item) => acc + (item.lp || 4.0), 0);

  return {
    priorBpm: Math.round(sumBpm / list.length),
    avgHp: Number((sumHp / list.length).toFixed(2)),
    avgLp: Number((sumLp / list.length).toFixed(2)),
    count: list.length
  };
}

/** 신뢰도(Quality) 50 이상, 42~200 BPM 인 측정만 학습 큐에 누적한다. */
export function saveCalibrationSample(bpm, filterState, quality) {
  if (quality < 50 || bpm < 42 || bpm > 200 || !filterState) return;
  const storage = getStorage();
  if (!storage) return;

  const list = readJsonList(CALIB_STORAGE_KEY);
  list.unshift({
    bpm,
    hp: filterState.hp,
    lp: filterState.lp,
    t: Date.now()
  });

  try {
    storage.setItem(CALIB_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CALIB_ITEMS)));
  } catch (_) {
    // 무시
  }
}

/* ── 사용자 설정 (측정 시간 · 카메라 방향) ─────────────────────────────── */

const DEFAULT_SETTINGS = { durationSec: 30, facingMode: 'environment' };

/** 저장된 설정을 불러온다. (값이 없거나 깨지면 기본값) */
export function loadAppSettings() {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const durationSec = [15, 30, 60].includes(Number(parsed.durationSec))
      ? Number(parsed.durationSec)
      : DEFAULT_SETTINGS.durationSec;
    const facingMode = parsed.facingMode === 'user' ? 'user' : 'environment';
    return { durationSec, facingMode };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 설정 일부만 바꿔도 나머지는 유지하며 저장한다. */
export function saveAppSettings(partial = {}) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const next = { ...loadAppSettings(), ...partial };
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch (_) {
    // 용량 초과 등은 조용히 무시 (앱 동작 우선)
  }
}
