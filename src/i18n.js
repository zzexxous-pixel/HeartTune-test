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
    'app.menu.title': '메뉴',
    'app.settings.title': '설정',
    'app.settings.language': '언어',
    'app.close': '닫기',
    'app.nav.measure': '측정하기',
    'app.nav.history': '측정이력',
    'app.nav.guide': '측정안내',

    'measure.config.durationLabel': '측정 시간 선택',
    'measure.config.sec15': '15초',
    'measure.config.sec15sub': '빠른 확인',
    'measure.config.sec30': '30초',
    'measure.config.sec30sub': '권장 · 리듬 확인',
    'measure.config.sec60': '60초',
    'measure.config.sec60sub': '정밀 확인',
    'measure.config.cameraSelect': '카메라 선택',
    'measure.config.cameraRear': '후면 카메라',
    'measure.config.cameraFront': '전면 카메라',

    'measure.indicator.group': '측정 참고 신호',
    'measure.indicator.arrhythmia': '부정맥',
    'measure.indicator.bradycardia': '서맥',
    'measure.indicator.tachycardia': '빈맥',
    'measure.indicator.signalQuality': '측정 신호 품질',
    'measure.indicator.arrhythmiaHint': '박동 간격 변화가 크게 감지되면 표시합니다.',
    'measure.indicator.bradycardiaHint': '심박수가 분당 60회 미만일 때 표시합니다.',
    'measure.indicator.tachycardiaHint': '심박수가 분당 100회를 초과할 때 표시합니다.',
    'measure.indicator.signalQualityHint': '측정 신호가 분석에 적합했는지를 나타냅니다.',
    'measure.indicator.detected': '신호 있음',
    'measure.indicator.notDetected': '신호 없음',
    'measure.indicator.quality.good': '좋음',
    'measure.indicator.quality.fair': '보통',
    'measure.indicator.quality.poor': '낮음',
    'measure.indicator.quality.unknown': '확인 불가',

    'measure.status.stabilizing': '신호 영점을 맞추고 있어요 (5초 내 첫 수치 표시)',
    'measure.status.measuringLive': '실시간 맞춤 추적 중… 최종값은 완료 후 확정됩니다',
    'measure.status.holdingNoise': '손가락 흔들림 감지 — 직전 맞춤 필터를 유지합니다',
    'measure.status.completed': '측정이 완료되었습니다',
    'measure.status.simulating': '시뮬레이션 신호로 고속 캘리브레이션 중입니다',
    'measure.status.cameraStarting': '카메라를 준비하고 있어요…',
    'measure.status.cameraUnavailable': '카메라를 켤 수 없어요. 측정 시작을 누르면 다시 시도합니다.',

    'measure.unit.bpm': '회/분',
    'measure.waveform.accessible': '카메라 측정 파형',
    'measure.waveform.title': '카메라 측정 파형',
    'measure.status.readyTitle': '카메라 렌즈에 손가락을 가볍게 대주세요',

    'measure.cta.start': '측정 시작',
    'measure.cta.stop': '측정 취소',
    'measure.cta.remeasure': '다시 측정',
    'measure.cta.shareImage': '결과 이미지로 공유·저장',
    'measure.cta.saveImage': '이미지 저장',
    'measure.result.details': '자세히 보기',
    'share.card.title': '❤️ 오늘심박 (HeartTune)',
    'details.measurementTime': '측정일시',
    'details.duration': '측정시간',
    'details.duration.value': '{seconds}초',
    'details.heartRate': '맥박',

    'result.normal.title': '정상 범위예요',
    'result.normal.desc': '측정된 심박수가 일반적인 참고 범위에 있습니다.',
    'result.brady.title': '서맥 참고 신호',
    'result.brady.desc': '심박수가 분당 60회 미만으로 측정되었습니다. 결과는 참고용입니다.',
    'result.tachy.title': '빈맥 참고 신호',
    'result.tachy.desc': '심박수가 분당 100회를 초과해 측정되었습니다. 결과는 참고용입니다.',
    'result.irregular.title': '부정맥 참고 신호',
    'result.irregular.desc': '박동 간격 변화가 크게 측정되었습니다. 결과는 참고용입니다.',
    'result.signals.summary': '{signals} 참고 신호',
    'result.shortNote.text': '15초 측정 결과는 참고용입니다.',

    'error.camera.denied': '카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.',
    'error.camera.notFound': '사용 가능한 카메라를 찾지 못했습니다. 디버그 콘솔에서 시뮬레이션 모드를 사용할 수 있습니다.',
    'error.signal.tooDark': '화면이 너무 어두워요. 플래시 또는 밝은 조명 아래에서 손가락을 대주세요.',
    'error.signal.tooBright': '주변 빛이 너무 강해요. 카메라 렌즈를 손가락으로 완전히 덮어주세요.',
    'error.signal.pressHarder': '손가락을 카메라 렌즈에 조금만 더 밀착해 대주세요.',

    'history.header.title': '측정이력',
    'history.header.clearAll': '측정 이력 전체 삭제',
    'history.confirm.clearAll': '측정 이력을 모두 삭제하시겠습니까?',
    'history.confirm.deleteOne': '이 측정 기록을 삭제하시겠습니까?',
    'history.detail.back': '뒤로',
    'history.detail.delete': '이 기록 삭제',
    'share.action.label': '이미지로 공유·저장',
    'history.undo.message': '삭제되었습니다.',
    'history.undo.button': '삭제 취소',
    'history.action.delete': '삭제',
    'history.item.replay': '이 측정 결과 자세히 보기',
    'history.replay.busy': '측정이 끝난 뒤에 이력을 볼 수 있어요.',
    'history.status.normal': '정상',
    'history.status.suspected': '{signals} 의심',
    'history.ad.legal': '본 앱은 의료기기가 아니며, 측정 결과는 참고용 정보입니다. 의학적 판단이나 진료를 대체할 수 없습니다. 측정 기록은 이 기기(브라우저)에만 저장됩니다.',
    'history.empty.text': '아직 저장된 측정 기록이 없습니다. 첫 심박수를 측정해 보세요.',

    'guide.step1.title': '1. 검지 손가락 올리기',
    'guide.step1.desc': '휴대폰 뒷면의 카메라 렌즈와 플래시를 검지 끝으로 동시에 덮어주세요. 너무 세게 누르면 혈류가 막혀 신호가 약해집니다.',
    'guide.step2.title': '2. 5초 고속 영점 조절 & 실시간 추적',
    'guide.step2.desc': '측정 시작 후 5초 만에 첫 심박수를 포착하고, 종료될 때까지 내 맥박 주파수를 따라 필터가 자동 조절됩니다.',
    'guide.step3.title': '3. 가족에게 큰 글씨 이미지 공유',
    'guide.step3.desc': '측정이 끝나면 [이미지 저장] 버튼을 눌러 카카오톡 등으로 자녀나 부모님께 쉽게 전달하세요.',
    'guide.rhythm.title': '부정맥·빈맥·서맥이란?',
    'guide.rhythm.note': '아래 설명은 일반 건강 정보입니다. 이 앱의 측정 결과는 참고용 신호이며, 확정적인 의학적 판단을 대신하지 않습니다.',
    'guide.rhythm.arrhythmia': '심장 박동의 속도나 리듬이 평소와 다르게 나타나는 여러 상태를 가리키는 말입니다.',
    'guide.rhythm.tachycardia': '심장이 평소보다 빠르게 뛰는 상태를 가리키는 일반 용어입니다.',
    'guide.rhythm.bradycardia': '심장이 평소보다 느리게 뛰는 상태를 가리키는 일반 용어입니다.',
    'guide.rhythm.learnMore': '더 알아보기',
    'guide.rhythm.url': 'https://sev.severance.healthcare/sev/news/press/medical-report.do?mode=view&articleNo=129731&title=%5B%EC%84%B8%EB%B8%8C%EB%9E%80%EC%8A%A4%EB%B3%91%EC%9B%90%5D+%EB%B6%80%EC%A0%95%EB%A7%A5',

    'legal.disclaimer.main': '본 앱은 의료기기가 아니며, 측정 결과는 참고용 정보입니다. 의학적 판단이나 진료를 대체할 수 없습니다.',
    'legal.disclaimer.short': '본 앱은 의료기기가 아니며, 결과는 참고용입니다.',
    'legal.title': '법적 고지',
    'legal.privacy.local': '카메라 영상은 심박 추출 직후 즉시 폐기되며 외부 서버로 절대 전송되지 않습니다.',
    'legal.privacy.title': '개인정보 처리방침',
    'legal.privacy.serverless': '본 앱은 서버가 없어 회원가입이나 로그인 없이 동작합니다.',
    'legal.privacy.storage': '측정 기록, 캘리브레이션 학습 데이터, 설정값을 포함한 모든 데이터는 이 기기(브라우저 저장공간)에만 저장되며, 측정 데이터는 휴대폰 밖으로 전송되지 않습니다.',
    'legal.privacy.noShare': '수집, 판매, 제3자 제공을 하지 않으며, 측정 데이터를 외부 서버나 광고 도구로 보내지 않습니다.',
    'legal.privacy.delete': '측정이력 시트의 휴지통 버튼으로 기록과 학습 데이터를 지울 수 있고, 브라우저의 사이트 데이터 삭제로도 모두 지울 수 있습니다.',
    'debug.resize': '디버그 창 크기 조절',
    'pwa.install.banner': '홈 화면에 [오늘심박]을 추가하면 언제든 한 번에 열 수 있어요.',
    'pwa.install.btn': '홈 화면 설치'
  },

  en: {
    'app.brand.name': 'HeartTune',
    'app.brand.sub': 'HeartTune · Heart Rate Monitor',
    'app.brand.slogan': 'Check your heart rhythm in just 30 seconds',
    'app.header.langToggle': '한국어',
    'app.menu.title': 'Menu',
    'app.settings.title': 'Settings',
    'app.settings.language': 'Language',
    'app.close': 'Close',
    'app.nav.measure': 'Measure',
    'app.nav.history': 'History',
    'app.nav.guide': 'Guide',

    'measure.config.durationLabel': 'Measurement Duration',
    'measure.config.sec15': '15s',
    'measure.config.sec15sub': 'Quick check',
    'measure.config.sec30': '30s',
    'measure.config.sec30sub': 'Recommended',
    'measure.config.sec60': '60s',
    'measure.config.sec60sub': 'Detailed',
    'measure.config.cameraSelect': 'Select Camera',
    'measure.config.cameraRear': 'Rear camera',
    'measure.config.cameraFront': 'Front camera',

    'measure.indicator.group': 'Measurement reference indicators',
    'measure.indicator.arrhythmia': 'Arrhythmia',
    'measure.indicator.bradycardia': 'Bradycardia',
    'measure.indicator.tachycardia': 'Tachycardia',
    'measure.indicator.signalQuality': 'Measurement signal quality',
    'measure.indicator.arrhythmiaHint': 'Shown when substantial beat-interval variation is detected.',
    'measure.indicator.bradycardiaHint': 'Shown when the measured rate is below 60 bpm.',
    'measure.indicator.tachycardiaHint': 'Shown when the measured rate is above 100 bpm.',
    'measure.indicator.signalQualityHint': 'Indicates whether the signal was suitable for analysis.',
    'measure.indicator.detected': 'Signal present',
    'measure.indicator.notDetected': 'No signal',
    'measure.indicator.quality.good': 'Good',
    'measure.indicator.quality.fair': 'Fair',
    'measure.indicator.quality.poor': 'Low',
    'measure.indicator.quality.unknown': 'Unavailable',

    'measure.status.stabilizing': 'Calibrating signal (First reading appears within 5s)',
    'measure.status.measuringLive': 'Adaptive tracking active… Final result appears upon completion',
    'measure.status.holdingNoise': 'Motion detected — Holding previous clean filter band',
    'measure.status.completed': 'Measurement Complete',
    'measure.status.simulating': 'Fast-calibrating with synthetic PPG signal',
    'measure.status.cameraStarting': 'Preparing camera…',
    'measure.status.cameraUnavailable': 'Camera unavailable. Press Start to try again.',

    'measure.unit.bpm': 'bpm',
    'measure.waveform.accessible': 'Camera-measured waveform',
    'measure.waveform.title': 'Camera-measured waveform',
    'measure.status.readyTitle': 'Gently place your finger over the camera lens',

    'measure.cta.start': 'Start Measure',
    'measure.cta.stop': 'Cancel',
    'measure.cta.remeasure': 'Measure Again',
    'measure.cta.shareImage': 'Share / Save Image Card',
    'measure.cta.saveImage': 'Save image',
    'measure.result.details': 'Show details',
    'share.card.title': '❤️ HeartTune',
    'details.measurementTime': 'Date and time',
    'details.duration': 'Measurement time',
    'details.duration.value': '{seconds} seconds',
    'details.heartRate': 'Heart rate',

    'result.normal.title': 'Within Normal Range',
    'result.normal.desc': 'The measured rate is within a typical reference range.',
    'result.brady.title': 'Bradycardia signal',
    'result.brady.desc': 'The measured rate was below 60 bpm. Results are for reference only.',
    'result.tachy.title': 'Tachycardia signal',
    'result.tachy.desc': 'The measured rate was above 100 bpm. Results are for reference only.',
    'result.irregular.title': 'Arrhythmia signal',
    'result.irregular.desc': 'Substantial beat-interval variation was measured. Results are for reference only.',
    'result.signals.summary': 'Signals: {signals}',
    'result.shortNote.text': '15s results are for reference.',

    'error.camera.denied': 'Camera permission denied. Please enable camera access in your browser settings.',
    'error.camera.notFound': 'No camera found. You can use the Simulation Mode in the debug console.',
    'error.signal.tooDark': 'Too dark. Please use the flash or measure in a well-lit area.',
    'error.signal.tooBright': 'Too much ambient light. Completely cover the camera lens with your fingertip.',
    'error.signal.pressHarder': 'Please place your fingertip slightly closer to the camera lens.',

    'history.header.title': 'Measurement History',
    'history.header.clearAll': 'Delete all measurement history',
    'history.confirm.clearAll': 'Delete all measurement history?',
    'history.confirm.deleteOne': 'Delete this measurement record?',
    'history.detail.back': 'Back',
    'history.detail.delete': 'Delete this record',
    'share.action.label': 'Share or save as image',
    'history.undo.message': 'Deleted.',
    'history.undo.button': 'Undo',
    'history.action.delete': 'Delete',
    'history.item.replay': 'View details of this measurement',
    'history.replay.busy': 'You can view history after the measurement finishes.',
    'history.status.normal': 'Normal',
    'history.status.suspected': 'Possible {signals}',
    'history.ad.legal': 'This app is NOT a medical device. Results are for reference only and do not replace professional medical advice. Records are saved only on this device (browser).',
    'history.empty.text': 'No saved records yet. Start your first heart rate check today.',

    'guide.step1.title': '1. Place Your Index Finger',
    'guide.step1.desc': 'Gently cover both the rear camera lens and flash. Pressing too hard restricts blood flow and weakens the signal.',
    'guide.step2.title': '2. 5s Fast Lock & Adaptive Tracking',
    'guide.step2.desc': 'Locks onto your pulse within 5 seconds and continuously adapts the filter band until completion.',
    'guide.step3.title': '3. Share Large-Print Image Card',
    'guide.step3.desc': 'Tap [Save image] after measuring to easily send a clear summary card to your family.',
    'guide.rhythm.title': 'About arrhythmia, tachycardia and bradycardia',
    'guide.rhythm.note': 'These are general health explanations. App readings are reference signals and do not replace professional medical judgment.',
    'guide.rhythm.arrhythmia': 'A general term for changes in the speed or rhythm of the heartbeat.',
    'guide.rhythm.tachycardia': 'A general term for a heart rate that is faster than usual.',
    'guide.rhythm.bradycardia': 'A general term for a heart rate that is slower than usual.',
    'guide.rhythm.learnMore': 'Learn more',
    'guide.rhythm.url': 'https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia',

    'legal.disclaimer.main': 'This app is NOT a medical device. Results are for reference only and do not replace professional medical advice.',
    'legal.disclaimer.short': 'Not a medical device. Results are for reference only.',
    'legal.title': 'Legal notice',
    'legal.privacy.local': 'Camera frames are processed locally in real time and never leave your browser.',
    'legal.privacy.title': 'Privacy policy',
    'legal.privacy.serverless': 'This app has no server and works without sign-up or login.',
    'legal.privacy.storage': 'All data, including measurement records, calibration learning data, and settings, is stored only on this device (browser storage). Measurement data never leaves your phone.',
    'legal.privacy.noShare': 'We do not collect, sell, or share data with third parties, and we do not send measurement data to external servers or ad tools.',
    'legal.privacy.delete': 'You can delete records and learning data with the trash button in the history sheet, or clear everything in the browser\'s site data settings.',
    'debug.resize': 'Resize debug panel',
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

/**
 * 측정 이력 목록용 일시 형식.
 *  · 한국어: YYYY/MM/DD HH:mm:ss (24시간제)
 *  · 영어:   MM/DD/YYYY h:mm:ss AM/PM (미국 표기)
 */
export function formatHistoryDateTime(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  if (currentLang === 'ko') {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d);
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