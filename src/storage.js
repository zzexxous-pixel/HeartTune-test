/**
 * 측정 이력 저장 — localStorage
 *
 * ⚠️ localStorage는 브라우저·기기별 저장이다. PC에서 잰 값이 휴대폰에
 *    보이지 않는다 → UI에서 "이 기기에만 저장됩니다"를 고지한다.
 * ⚠️ iOS PWA는 장기간 미사용 시 localStorage가 정리될 수 있다.
 * ⚠️ 용량 한도(약 5MB) → 보관 상한을 두고 오래된 것부터 삭제.
 */

const KEY = 'hearttune.history.v1';
const MAX_RECORDS = 200;

/** @typedef {{ts:string, bpm:number, verdict:string, rhythm:string, cv:number, durationSec:number, quality:number}} Record */

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @returns {Record[]} 최신순 */
export function loadHistory() {
  try {
    const list = safeParse(localStorage.getItem(KEY) ?? '[]');
    // 잘못된 형태 방어
    return list.filter((r) => r && typeof r.bpm === 'number' && typeof r.ts === 'string');
  } catch {
    return [];
  }
}

/** 새 기록을 앞에 추가하고 상한을 넘으면 잘라낸다. */
export function addHistory(record) {
  try {
    const list = [record, ...loadHistory()].slice(0, MAX_RECORDS);
    localStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    // 프라이빗 모드·용량 초과 시 조용히 무시 (측정 자체는 성공했으므로)
    return [record];
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

/** 추이 그래프용 최근 N건 (오래된 순) */
export function recentForChart(n = 20) {
  return loadHistory().slice(0, n).reverse();
}
