/**
 * src/i18n.js
 * 오늘심박 (HeartTune) — 다국어(i18n) 사전 및 포맷터 모듈
 */

export const dictionaries = {
  ko: {
    'app.brand.name': '오늘심박',
    'app.brand.sub': 'HeartTune · 심박수 측정기',
    'app.brand.slogan': '오늘 내 심장, 30초면 충분해요',
    'app.header.langToggle': 'EN',
    'app.header.screenLight': '화면 조명',
    'app.header.screenLightOn': '조명 켜짐',
    'app.nav.measure': '측정하기',
    'app.nav.history': '측정이력',
    'app.nav.guide': '측정안내',

    'measure.config.durationLabel': '측정 시간 선택',
    'measure.config.sec15': '15초 (빠른 확인)',
    'measure.config.sec30': '30초 (권장·리듬 확인)',
    'measure.config.sec60': '60초 (정밀 확인)',
    'measure.config.cameraSelect': '카메라 선택',

    'measure.status.readyTitle': '검지를 후면 카메라와 플래시에 가볍게 대주세요',
    'measure.status.stabilizing': '신호 영점을 맞추고 있어요 (5초 내 첫 수치 표시)',
    'measure.status.measuringLive': '실시간 맞춤 추적 중… 최종값은 완료 후 확정됩니다',
    'measure.status.holdingNoise': '손가락 흔들림 감지 — 직전 맞춤 필터를 유지합니다',
    'measure.status.completed': '측정이 완료되었습니다',
    'measure.status.simulating': '시뮬레이션 신호로 고속 캘리브레이션 중입니다',

    'measure.unit.bpm': '회/분',
    'measure.metric.signalQuality': '신호 품질',
    'measure.metric.beatsDetected': '검출 박동',
    'measure.metric.rhythmCv': '리듬 변동(CV)',
    'measure.metric.channel': '맞춤 대역(Hz)',

    'measure.cta.start': '측정 시작',
    'measure.cta.stop': '측정 취소',
    'measure.cta.remeasure': '다시 측정',
    'measure.cta.shareImage': '결과 이미지로 공유·저장',

    'result.normal.title': '정상 범위예요',
    'result.normal.desc': '안정 시 일반적인 심박수 범위에 해당합니다. 규칙적인 건강 습관을 유지해 보세요.',
    'result.brady.title': '심장이 느리게 뛰고 있어요',
    'result.brady.desc': '분당 60회 미만으로 측정되었습니다. 어지러움이나 피로감이 있다면 의사와 상담해 보세요.',
    'result.tachy.title': '심장이 빠르게 뛰고 있어요',
    'result.tachy.desc': '분당 100회 초과로 측정되었습니다. 휴식 후 다시 측정해 보시고 지속되면 상담을 권장합니다.',
    'result.irregular.title': '리듬이 고르지 않아요. 의사와 상담해 보세요',
    'result.irregular.desc': '박동 간격의 변동성이 크게 나타났습니다. 손가락 흔들림이 없었다면 전문의 상담을 권장합니다.',
    'result.shortNote.text': '짧은 측정(15초)이라 리듬 결과는 참고만 하세요.',

    'error.camera.denied': '카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.',
    'error.camera.notFound': '사용 가능한 카메라를 찾지 못했습니다. 디버그 콘솔에서 시뮬레이션 모드를 사용할 수 있습니다.',
    'error.signal.tooDark': '화면이 너무 어두워요. 플래시 또는 밝은 조명 아래에서 손가락을 대주세요.',
    'error.signal.tooBright': '주변 빛이 너무 강해요. 카메라 렌즈를 손가락으로 완전히 덮어주세요.',
    'error.signal.pressHarder': '손가락을 카메라 렌즈에 조금만 더 밀착해 대주세요.',
    'error.webcam.notice': '플래시가 없는 카메라입니다. 밝은 곳에서 카메라에 손가락을 살짝 대거나 상단 [화면 조명]을 켜주세요.',

    'history.header.title': '최근 측정 이력',
    'history.header.clearAll': '전체 삭제',
    'history.notice.deviceOnly': '이 기기(브라우저)에만 저장되며, 최근 30건의 평균 심박수가 다음 측정의 초기 영점으로 자동 활용됩니다.',
    'history.empty.text': '아직 저장된 측정 기록이 없습니다. 첫 심박수를 측정해 보세요.',
    'history.trend.faster': '최근 평균보다 {diff}회/분 빨라졌어요',
    'history.trend.slower': '최근 평균보다 {diff}회/분 느려졌어요',
    'history.trend.same': '최근 평균과 비슷한 수준이에요',
    'history.trend.first': '첫 번째 측정 기록입니다. 꾸준히 측정하면 맞춤 영점이 더 정교해집니다.',

    'guide.step1.title': '1. 검지 손가락 올리기',
    'guide.step1.desc': '휴대폰 뒷면의 카메라 렌즈와 플래시를 검지 끝으로 동시에 덮어주세요. 너무 세게 누르면 혈류가 막혀 신호가 약해집니다.',
    'guide.step2.title': '2. 5초 고속 영점 조절 & 실시간 추적',
    'guide.step2.desc': '측정 시작 후 5초 만에 첫 심박수를 포착하고, 종료될 때까지 내 맥박 주파수를 따라 필터가 자동 조절됩니다.',
    'guide.step3.title': '3. 가족에게 큰 글씨 이미지 공유',
    'guide.step3.desc': '측정이 끝나면 [결과 이미지로 공유·저장] 버튼을 눌러 카카오톡 등으로 자녀나 부모님께 쉽게 전달하세요.',

    'legal.disclaimer.main': '본 앱은 의료기기가 아니며, 측정 결과는 참고용 정보입니다. 의학적 판단이나 진료를 대체할 수 없습니다.',
    'legal.privacy.local': '카메라 영상은 심박 추출 직후 즉시 폐기되며 외부 서버로 절대 전송되지 않습니다.',
    'pwa.install.banner': '홈 화면에 [오늘심박]을 추가하면 언제든 한 번에 열 수 있어요.',
    'pwa.install.btn': '홈 화면 설치'
  },

  en: {
    'app.brand.name': 'HeartTune',
    'app.brand.sub': 'HeartTune · Heart Rate Monitor',
    'app.brand.slogan': 'Check your heart rhythm in just 30 seconds',
    'app.header.langToggle': '한국어',
    'app.header.screenLight': 'Screen Light',
    'app.header.screenLightOn': 'Light ON',
    'app.nav.measure': 'Measure',
    'app.nav.history': 'History',
    'app.nav.guide': 'Guide',

    'measure.config.durationLabel': 'Measurement Duration',
    'measure.config.sec15': '15s (Quick Check)',
    'measure.config.sec30': '30s (Recommended)',
    'measure.config.sec60': '60s (Detailed)',
    'measure.config.cameraSelect': 'Select Camera',

    'measure.status.readyTitle': 'Gently cover the rear camera and flash with your index finger',
    'measure.status.stabilizing': 'Calibrating signal (First reading appears within 5s)',
    'measure.status.measuringLive': 'Adaptive tracking active… Final result appears upon completion',
    'measure.status.holdingNoise': 'Motion detected — Holding previous clean filter band',
    'measure.status.completed': 'Measurement Complete',
    'measure.status.simulating': 'Fast-calibrating with synthetic PPG signal',

    'measure.unit.bpm': 'bpm',
    'measure.metric.signalQuality': 'Signal Quality',
    'measure.metric.beatsDetected': 'Beats',
    'measure.metric.rhythmCv': 'Rhythm CV',
    'measure.metric.channel': 'Band(Hz)',

    'measure.cta.start': 'Start Measure',
    'measure.cta.stop': 'Cancel',
    'measure.cta.remeasure': 'Measure Again',
    'measure.cta.shareImage': 'Share / Save Image Card',

    'result.normal.title': 'Within Normal Range',
    'result.normal.desc': 'Your resting heart rate is within the typical range. Keep up your healthy daily habits.',
    'result.brady.title': 'Heart is beating slowly',
    'result.brady.desc': 'Measured below 60 bpm. If you feel dizzy or fatigued, please consult a physician.',
    'result.tachy.title': 'Heart is beating fast',
    'result.tachy.desc': 'Measured above 100 bpm. Rest and measure again, or consult a doctor if it persists.',
    'result.irregular.title': 'Rhythm appears uneven. Consider consulting a doctor',
    'result.irregular.desc': 'High beat-to-beat variability detected. If your finger was steady, consider medical advice.',
    'result.shortNote.text': 'Short (15s) measurement: rhythm analysis is for reference only.',

    'error.camera.denied': 'Camera permission denied. Please enable camera access in your browser settings.',
    'error.camera.notFound': 'No camera found. You can use the Simulation Mode in the debug console.',
    'error.signal.tooDark': 'Too dark. Please use the flash or measure in a well-lit area.',
    'error.signal.tooBright': 'Too much ambient light. Completely cover the camera lens with your fingertip.',
    'error.signal.pressHarder': 'Please place your fingertip slightly closer to the camera lens.',
    'error.webcam.notice': 'No flash detected on this camera. Measure in a bright room or turn on [Screen Light] above.',

    'history.header.title': 'Measurement History',
    'history.header.clearAll': 'Clear All',
    'history.notice.deviceOnly': 'Saved only on this device. Your recent 30-record average is used to auto-calibrate the next measurement.',
    'history.empty.text': 'No saved records yet. Start your first heart rate check today.',
    'history.trend.faster': '{diff} bpm faster than your recent average',
    'history.trend.slower': '{diff} bpm slower than your recent average',
    'history.trend.same': 'Consistent with your recent average',
    'history.trend.first': 'First record saved. Regular checks improve personalized auto-calibration.',

    'guide.step1.title': '1. Place Your Index Finger',
    'guide.step1.desc': 'Gently cover both the rear camera lens and flash. Pressing too hard restricts blood flow and weakens the signal.',
    'guide.step2.title': '2. 5s Fast Lock & Adaptive Tracking',
    'guide.step2.desc': 'Locks onto your pulse within 5 seconds and continuously adapts the filter band until completion.',
    'guide.step3.title': '3. Share Large-Print Image Card',
    'guide.step3.desc': 'Tap [Share / Save Image Card] after measuring to easily send a clear summary card to your family.',

    'legal.disclaimer.main': 'This app is NOT a medical device. Results are for reference only and do not replace professional medical advice.',
    'legal.privacy.local': 'Camera frames are processed locally in real time and never leave your browser.',
    'pwa.install.banner': 'Add HeartTune to your Home Screen for quick one-tap access.',
    'pwa.install.btn': 'Install App'
  }
};

const STORAGE_LANG_KEY = 'hearttune_lang';

export function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_LANG_KEY);
    if (saved && dictionaries[saved]) return saved;
  } catch (_) {}
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  return 'ko';
}

let currentLang = detectInitialLang();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!dictionaries[lang]) return currentLang;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_LANG_KEY, lang);
  } catch (_) {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  return currentLang;
}

export function t(key, params = {}) {
  const dict = dictionaries[currentLang] || dictionaries.ko;
  let str = dict[key] || dictionaries.ko[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, String(v));
  }
  return str;
}

export function formatNumber(num) {
  const locale = currentLang === 'ko' ? 'ko-KR' : 'en-US';
  return new Intl.NumberFormat(locale).format(num);
}

export function formatDateTime(timestamp) {
  const locale = currentLang === 'ko' ? 'ko-KR' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

export function validateI18nKeyParity() {
  const koKeys = Object.keys(dictionaries.ko).sort();
  const enKeys = Object.keys(dictionaries.en).sort();
  const missingInEn = koKeys.filter((k) => !enKeys.includes(k));
  const missingInKo = enKeys.filter((k) => !koKeys.includes(k));
  return {
    valid: missingInEn.length === 0 && missingInKo.length === 0,
    missingInEn,
    missingInKo,
    totalKeys: koKeys.length
  };
}