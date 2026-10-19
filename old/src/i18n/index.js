/**
 * i18n 로더
 *
 * 설계 원칙
 * - 화면 텍스트를 코드에 하드코딩하지 않고 전부 ko.json / en.json 키로 참조한다.
 * - 새 언어는 `PACKS`에 파일 한 줄 추가하는 것만으로 확장된다.
 * - 키는 `화면.영역.항목` 3단 구조를 따른다 (예: result.normal.title).
 * - 번역 누락 시 영어 → 한국어 순으로 폴백하고 콘솔에 경고한다 (CI에서도 검증).
 */

export const SUPPORTED = ['ko', 'en'];
export const FALLBACK = 'en';
export const DEFAULT_LANG = 'ko';

/**
 * ⚠️ `import ... with { type: 'json' }` 구문은 iOS 17.2 / Chrome 123 이상에서만
 *    동작한다. 중장년 사용자의 구형 스마트폰을 위해 fetch로 읽는다.
 *    import.meta.url 기준으로 해석하므로 GitHub Pages 하위 경로에서도 안전.
 */
const PACKS = {
  ko: () => fetch(new URL('./ko.json', import.meta.url)).then((r) => r.json()),
  en: () => fetch(new URL('./en.json', import.meta.url)).then((r) => r.json()),
};

const STORE_KEY = 'hearttune.lang';

/** @type {Record<string, any>} */
let dict = {};
/** @type {Record<string, any>} */
let fallbackDict = {};
let current = DEFAULT_LANG;

/** 중첩 객체에서 점 표기 키로 값을 찾는다. */
function lookup(obj, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

/** 브라우저 언어를 지원 목록과 맞춘다. (ko-KR -> ko) */
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {
    /* localStorage 차단 환경(프라이빗 모드 등) */
  }
  const nav = (navigator.language || DEFAULT_LANG).toLowerCase();
  const base = nav.split('-')[0];
  return SUPPORTED.includes(base) ? base : DEFAULT_LANG;
}

/** 언어 팩을 읽어온다. 앱 시작 시 한 번 호출. */
export async function initI18n(lang = detectLanguage()) {
  current = SUPPORTED.includes(lang) ? lang : DEFAULT_LANG;
  dict = (await PACKS[current]()) || {};
  fallbackDict = current === FALLBACK ? dict : (await PACKS[FALLBACK]()) || {};
  document.documentElement.lang = current;
  try {
    localStorage.setItem(STORE_KEY, current);
  } catch {
    /* 무시 */
  }
  return current;
}

/** 번역 문자열을 반환한다. 없으면 폴백 언어 → 키 자체. */
export function t(key, vars) {
  let value = lookup(dict, key);
  if (typeof value !== 'string') {
    value = lookup(fallbackDict, key);
    if (typeof value === 'string' && current !== FALLBACK) {
      console.warn(`[i18n] 누락: ${key} (${current})`);
    }
  }
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  );
}

export function getLanguage() {
  return current;
}

/** DOM의 data-i18n / data-i18n-attr 속성을 기준으로 텍스트를 채운다. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    // 형식: "aria-label:key;title:key"
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
}

/** 숫자·단위는 Intl로 지역화한다. */
export function formatNumber(value, opts = {}) {
  try {
    return new Intl.NumberFormat(current, opts).format(value);
  } catch {
    return String(value);
  }
}

export function formatDateTime(iso) {
  try {
    return new Intl.DateTimeFormat(current, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}
