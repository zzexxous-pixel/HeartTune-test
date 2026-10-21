# 60 · Google Stitch 전체 UX·디자인 개선 가이드

> 최종 갱신: 2026-10-21 (KST) · 목적: Stitch로 전체 앱 UX/디자인을 다시 설계하고, 결과 코드를 이 저장소의 **Vanilla JS + ES Modules** 구조에 안전하게 다시 합치기 위한 절차
> 관련: `agent.md` 2절(불변 원칙) · `10-spec.md` 4-5b(원스크린) · `50-ad-strategy.md`

---

## 1. 먼저 알아둘 제약 (Stitch 결과를 합칠 때 생기는 문제)

Stitch 결과물은 **화면 구조와 스타일의 시안**이다. 기능 로직과 앱 상태 관리는 포함되지 않는다. 공식 설명과 후기 자료에서도 다음이 확인된다. [1](https://justinmckelvey.com/blog/how-to-use-google-stitch) · [2](https://0xminds.com/blog/guides/google-stitch-tutorial-prompts-guide) · [3](https://almcorp.com/blog/google-stitch-complete-guide-ai-ui-design-tool-2026/)

| Stitch 특성 | 이 프로젝트에 주는 영향 | 대응 |
|---|---|---|
| 내보내기 형식: HTML/CSS, Tailwind, React/JSX 등 | Tailwind·React 결과는 이 저장소 구조와 맞지 않음 | **HTML/CSS 내보내기만 사용**. Tailwind 옵션은 선택하지 않음 |
| 생성 코드에 JavaScript 기능이 없음 | 측정·이력·시트 동작을 잃음 | 기능 코드는 기존 `src/*.js`를 유지하고, 마크업·스타일만 교체 |
| 이미지·에셋 경로가 플레이스홀더 | 깨진 경로, 오프라인 캐시 누락 | 모든 경로를 `./` 상대경로로 정리, 새 파일은 `sw.js ASSETS`·`scripts/build-dist.js RUNTIME_FILES` 양쪽 등록 |
| 문구가 하드코딩되어 나옴 | 한·영 전환과 ko/en 키 검증이 깨짐 | 모든 문구를 `src/i18n.js` 키로 치환 (ko/en 키 집합 일치 필수) |
| 스타일이 전역 충돌 가능 | 기존 클래스·id와 충돌 | 아래 "보존 목록"의 id·class를 유지하거나 매핑표로 대응 |
| 무료 생성 횟수 제한 | 반복 수정 비용 | 화면별 프롬프트를 나눠서 실행. 한 번에 전체 생성하지 않음 |

> 핵심: **Stitch가 바꿀 수 있는 것은 "보이는 것(마크업·CSS·레이아웃·색·타이포)"이다. "동작하는 것(측정 로직·DSP·저장·시트 제어)"은 Stitch 결과로 덮어쓰지 않는다.**

---

## 2. 반드시 지켜야 할 불변 원칙 (프롬프트에 그대로 넣을 것)

`agent.md` 2절에서 발췌했다. 위반하면 CI 또는 제품 원칙에 걸린다.

1. "진단"이라는 단어를 쓰지 않는다. 결과는 "정상 범위예요", "리듬이 고르지 않아요" 수준.
2. 결과는 **참고용**임을 항상 병기한다.
3. 첫 화면은 **100dvh 한 화면, 스크롤 없음**. 링(카메라 미리보기 포함) → 파형 → 메시지 3영역의 순서와 크기를 대기·측정·결과에서 고정.
4. 카메라 미리보기 원형은 **54px 고정**(사용자 지정, 변경 금지).
5. 헤더 순서: **[≡ 메뉴] [❤️ 로고] [EN] [⚙️ 설정]**. 탭바 없음.
6. 기본 글자 **18px 이상**, BPM 숫자 **64px 이상**.
7. 탭 영역 **최소 48×48px**, 인접 버튼 간격 **8px 이상**.
8. 색만으로 상태를 전달하지 않는다. 색 + 아이콘 + 문구를 함께 쓴다.
9. `:hover` 단독 상태 금지 → `:focus-visible` 병행.
10. 중장년 사용자 기준: 큰 글씨, 높은 대비, 한 화면에 주요 행동 하나.
11. 광고는 메인 화면에 두지 않는다. 광고는 측정이력 시트 하단에만 존재한다(`50-ad-strategy.md` B-3).
12. 공유 이미지(결과 PNG)에는 광고를 넣지 않는다.

---

## 3. Stitch에 제공할 파일과 자료

Stitch는 "이미지 + 텍스트"를 입력으로 받을 수 있다(공식 기능 및 후기 자료 기준). 아래를 준비한다. [1](https://justinmckelvey.com/blog/how-to-use-google-stitch) · [4](https://www.ordoh.com/google-stitch-design-tool-guide/)

### 3-1. 필수 자료
| 파일 | 위치 | 용도 |
|---|---|---|
| 현재 원스크린 스크린샷 (대기·측정·결과) | 미리보기 서버 `http://localhost:8080/` 또는 PR 미리보기에서 캡처 (320×568, 393×851 각각) | 현재 레이아웃 기준선 |
| 와이어프레임 | `docs/assets/one-screen-wireframe.jpg` | 영역 배치 기준 |
| 측정이력 시트 스크린샷 | 메뉴 → 측정이력 | 새 그래프·목록·광고 영역 기준 |
| 측정 안내·상세·설정 시트 스크린샷 | 각 시트 | 시트 패턴 통일 |
| 브랜드 색 값 | `src/main.css` 상단 `:root` 변수 | 기존 토큰 유지 여부 결정 |
| 문구 목록 | `src/i18n.js` ko/en 사전 | 문구 길이 확인, 문구 변경 시 키 유지 |

### 3-2. 보존 목록 (Stitch 결과에서 이 id·속성을 반드시 남겨야 함)
아래 id는 `src/main.js`가 `document.getElementById`로 직접 찾는다. **id가 없으면 기능이 깨진다.**

```
헤더       : btnMenu, appTitleTrigger, btnLangToggle, btnSettings
스테이지   : ring-container(클래스), progressRingBar, cameraVideo, heartBeatIcon,
            bpmNumber, timerBadge, waveformBox, waveformCanvas, stageGuideText
결과       : resultBanner, resultIcon, resultTitle, resultDesc, resultShortNote, btnDetails
CTA        : btnShareImage, btnPrimaryMeasure
시트 공통  : sheetBackdrop, [data-sheet-close], sheet 클래스(.sheet, .sheet-tall, .sheet-compact)
설정       : settingsSheet, [data-duration], [data-facing], [data-lang]
메뉴       : menuSheet, menuHistory, menuGuide, menuLegal
이력       : historySheet, btnClearHistory, trendCard, trendYAxis, trendScroll, trendCanvas,
            historyList, historyAdSlot
안내       : guideSheet, guideRhythmLink
법적 고지   : legalSheet
상세       : detailsSheet, detailsDate, detailsDuration, detailsBpm, detailsBpmUnit,
            detailsWaveformCanvas, indicatorArrhythmia, indicatorBradycardia,
            indicatorTachycardia, indicatorSignalQuality, indicatorQualityState
토스트     : liveAlertBox
디버그     : debugConsole 및 하위 요소(개발자 전용, 디자인 변경 대상 아님)
```

추가 규칙:
- `data-i18n`, `data-i18n-aria`, `data-i18n-href` 속성을 **원래 문구가 있던 요소에 유지**한다.
- 시트의 `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-hidden` 속성을 유지한다.
- 시트 열림/닫힘은 클래스 `open`으로 제어된다(`sheets.js`). 클래스명 변경 금지.
- 결과 상태는 `body.has-result`, `resultBanner.status-normal|brady|tachy|irregular` 클래스로 제어된다.

### 3-3. 화면 상태 목록 (Stitch에서 각각 만들 것)
1. 대기 (카메라 미리보기 ON, BPM `--`)
2. 측정 중 (링 진행률, 파형 실시간, 타이머)
3. 결과 — 정상 / 서맥 / 빈맥 / 부정맥 참고 (배너 색·아이콘·문구)
4. 메뉴 시트, 설정 시트, 측정이력 시트(그래프 + 목록 + 하단 광고 영역), 측정 안내 시트, 법적 고지 시트, 상세 시트
5. 320×568(소형) · 393×851(표준) · 가로 모드 축약

---

## 4. Stitch 프롬프트

### 4-1. 1단계: 디자인 시스템 (먼저 실행)
> 한국어 중장년 사용자를 위한 건강 측정 웹앱 "오늘심박(HeartTune)"의 디자인 시스템을 만들어 줘.
> 
> 제품: 스마트폰 후면 카메라와 플래시로 손가락 맥박을 재고 심박수(BPM)를 보여주는 1페이지 PWA. 결과는 참고용 정보이며 의료기기가 아님.
> 사용자: 50~70대 중장년과 그 자녀. 큰 글씨, 높은 대비, 한 화면에 주요 행동 하나.
> 
> 색상: 차분한 의료 블루 계열 (기본 #0F4C81, 밝은 면 #F4F8FC, 테두리 #D6E0EA, 본문 #0F172A, 보조 텍스트 #475569). 정상은 초록(#15803D), 주의·의심은 빨강(#B91C1C), 서맥/빈맥 강조는 빨강. 색만으로 상태를 전달하지 말고 아이콘과 문구를 함께 쓸 것.
> 타이포: 시스템 한글 산세리프. 본문 최소 18px, BPM 숫자 최소 64px, 버튼 문구 20px 이상.
> 터치: 모든 버튼 최소 48×48px, 인접 버튼 간격 8px 이상. focus-visible 링 필수.
> 모서리: 카드 16px, 버튼 999px(필), 시트 상단 20px.
> 그림자는 최소화. 애니메이션은 짧고 부드럽게, 감소 모드 존중.
> 
> 출력: 디자인 토큰(색·간격·글자 크기·모서리·그림자)을 CSS 변수 목록으로 정리해 줘.

### 4-2. 2단계: 원스크린 메인 화면
> 디자인 시스템을 적용해서 모바일 웹 메인 화면을 만들어 줘. 화면 크기 320×568 기준, 100dvh, 스크롤 없음.
> 
> 레이아웃 (위에서 아래로, 고정 순서):
> 1. 헤더 52px: 왼쪽 ≡ 메뉴 버튼, 가운데 ❤️ 로고와 "오늘심박" 제목 (보조로 HeartTune), 오른쪽 EN 버튼과 ⚙️ 설정 버튼. 탭바 없음.
> 2. 스테이지: 원형 링(지름 약 200px) 중앙에 54px 원형 카메라 미리보기, 그 아래 ♥ + BPM 숫자(64px 이상, 단위 "회/분"), 타이머 배지(예: 00:30). 링은 진행률 표시.
> 3. 파형 박스: 제목 "카메라 측정 파형", 아래 파형 캔버스(고정 높이).
> 4. 메시지 영역: 고정 높이 박스. 대기 시 안내 문구 한 줄, 결과 시 제목 + "자세히 보기" 버튼 + 설명 + "참고용" 고지 문구.
> 5. 하단 CTA 바 56px 이상: 결과일 때만 보이는 보조 버튼 "결과 이미지로 공유·저장", 주 버튼 "측정 시작"(결과에서는 "다시 측정").
> 
> 제약: 링·파형·메시지의 순서와 크기는 대기·측정·결과 상태에서 바뀌지 않는다. 미리보기 원형은 54px 고정. 광고 영역은 메인 화면에 없다. 모든 문구는 한국어 예시로 쓰되, 실제 구현은 키로 치환하므로 문구 길이를 짧게 유지한다.
> 
> 출력: HTML/CSS만. Tailwind 없이 일반 CSS 클래스 사용. 외부 CDN, 외부 폰트 파일, 인라인 script 금지. 이미지는 쓰지 않고 SVG 또는 CSS로만 표현. 클래스 이름은 BEM 또는 짧은 의미 이름으로 붙일 것.

### 4-3. 3단계: 측정이력 시트 (광고 영역 포함)
> 같은 디자인 시스템으로 "측정이력" 바텀시트를 만들어 줘. 시트 높이는 화면의 86dvh.
> 
> 구조 (위에서 아래로 고정):
> 1. 헤더: 왼쪽 제목 "측정이력", 오른쪽에 휴지통 아이콘 버튼(전체 삭제)과 닫기(X) 버튼. 두 버튼 모두 48px 이상.
> 2. 그래프 카드: 텍스트 없이 그래프만. 왼쪽 고정 Y축(심박수 눈금 50~110, 단위 "회/분"), 오른쪽은 가로 스크롤 가능한 영역. X축은 측정 날짜를 M/D 형식으로 표시. 가로 그리드 라인. 점과 선 색은 정상 초록, 이상 빨강. 높이 약 150px.
> 3. 상세 목록: 세로 스크롤 영역. 한 줄에 상태 문구(정상 또는 "부정맥 의심" 등), 일시(YYYY/MM/DD HH:mm:ss), 측정 시간, BPM 숫자와 단위, 오른쪽 chevron(›). 줄을 왼쪽으로 밀면 빨간 "삭제" 버튼이 나타남. 줄 전체가 버튼처럼 보여야 함. 측정 신호 품질 문구는 넣지 않음.
> 4. 하단 광고 영역: 고정 영역. 현재는 법적 고지 문구 2~3줄만 있는 자리. 광고가 들어올 것을 대비해 높이를 미리 예약하고, "광고" 라벨 자리를 남겨 둘 것. 광고 자리 안팎에 링크나 버튼을 두지 말 것.
> 
> 빈 상태: 기록이 없으면 목록 자리에 안내 문구 한 줄과 부드러운 일러스트(SVG).
> 
> 출력: HTML/CSS. 목록 한 줄은 `<li class="history-item">` 안에 `<div class="history-row" role="button" tabindex="0">`과 `<button class="history-delete">`를 두는 구조를 유지할 것.

### 4-4. 4단계: 결과 화면 상태 (배너 3종 + 부정맥 등)
> 메인 화면의 결과 상태를 4가지 만들어 줘: 정상, 서맥(60 미만), 빈맥(100 초과), 부정맥 참고. 각 상태에서 메시지 영역의 제목 줄(아이콘 + 문구 + "자세히 보기"), 설명, "참고용" 문구의 위치를 같게 유지할 것.
> 아이콘은 SVG 원형 배지로 (정상: ✓, 서맥: ↓, 빈맥: ↑, 부정맥: !). 색은 보조 수단이며 아이콘과 문구가 기본.
> 복수 신호 문구 예: "부정맥, 빈맥 참고 신호".

### 4-5. 5단계: 나머지 시트 통일
> 설정 시트, 메뉴 시트, 측정 안내 시트, 법적 고지 시트, 상세 시트를 같은 헤더(제목 + 닫기 X)와 같은 본문 간격으로 맞춰 줘. 상세 시트에는 표시등 카드 4개(부정맥·서맥·빈맥·측정 신호 품질)를 두고, 빨강·초록 표시등과 상태 문구를 함께 쓸 것.

---

## 5. Stitch 결과를 저장소에 합치는 절차

Stitch 결과물을 받은 뒤 아래 순서로 처리한다. 이 저장소에서는 **에이전트가 합치고 검증**한다.

1. **내보내기**: HTML/CSS를 선택한다. 화면마다 파일을 나눠 받는다. 예: `stitch/main.html`, `stitch/history-sheet.html`.
2. **제공 방법**: 저장소 밖 임시 폴더에 두고 경로를 알려 준다, 또는 채팅에 붙여 넣는다. 이 저장소의 `docs/` 아래에 원본 Stitch 파일을 그대로 커밋하지 않는다(정리된 결과만 반영).
3. **매핑**: 에이전트가 다음을 수행한다.
   - 보존 목록의 id·속성이 모두 있는지 확인하고, 없으면 기존 id를 되살린다.
   - 문구를 `data-i18n` 키로 치환하고, `src/i18n.js`에 ko/en 키를 추가·삭제한다.
   - 경로를 `./` 상대경로로 정리한다. 절대경로와 외부 CDN은 제거한다.
   - CSS는 기존 `src/main.css`의 클래스와 충돌하지 않도록 네임스페이스를 붙이거나, 기존 파일을 교체한다(교체 시 시트·접근성 규칙 회귀 확인).
   - 새 파일을 추가하면 `sw.js ASSETS`와 `scripts/build-dist.js RUNTIME_FILES`에 둘 다 등록한다.
4. **검증 (Definition of Done, `agent.md` 9절)**
   - `npm run lint` · `npm run test:i18n` · `npm run test:unit` · `npm run test:e2e` · `npm run build`
   - 320×568, 393×851, 가로 모드에서 스크롤 0과 영역 순서 고정을 확인한다.
   - 측정 흐름(대기 → 측정 → 결과 → 다시 보기 → 시트 열기/닫기)을 손으로 한 번 더 확인한다.
5. **문서 갱신**: `10-spec.md` 4-5b, `agent.md` 5·6·7·10절.

---

## 6. 피해야 할 것 (Stitch 결과에서 자주 나오는 문제)

- 화면마다 레이아웃이 달라지는 것 → 3영역 고정 원칙 위반.
- 장식용 그라데이션·큰 일러스트가 BPM 숫자보다 눈에 띄는 것 → 핵심 수치 우선.
- 아이콘 전용 버튼에 텍스트 라벨이 없는 것 → 중장년 기준 낮은 인지성.
- 광고처럼 보이는 카드(추천, 특가)를 결과 근처에 두는 것 → 신뢰 훼손, 정책 위반 소지.
- `div` 클릭 처리 → `click` 이벤트를 쓰는 기존 규칙과 접근성(키보드) 확인 필요.
- 긴 영어 문구 → en 전환 시 줄바꿈 깨짐. 320px 폭에서 en 문구로도 확인.

---

## 참고 자료
1. Justin McKelvey, How to Use Google Stitch (2026) — https://justinmckelvey.com/blog/how-to-use-google-stitch
2. 0xminds, Google Stitch Tutorial: From Prompt to UI in Minutes — https://0xminds.com/blog/guides/google-stitch-tutorial-prompts-guide
3. ALM Corp, Google Stitch: The Complete Guide (2026) — https://almcorp.com/blog/google-stitch-complete-guide-ai-ui-design-tool-2026/
4. Ordoh, Google Stitch: Design Apps in Minutes (2026 Guide) — https://www.ordoh.com/google-stitch-design-tool-guide/
