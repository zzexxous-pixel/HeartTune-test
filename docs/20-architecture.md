# 20 · 기술 아키텍처

> 오늘심박 (HeartTune) — 스택, 배포, i18n, PWA, 크로스 디바이스 이슈.
> 원본: `00-brand-concept.md` 5절에서 분리 (2026-09-11).

---

## 5. 기술 스택 및 아키텍처

## 5-1. 프론트엔드
- **1페이지 SPA**: 프레임워크 없이 **Vanilla JS + ES Modules** (파일 구조는 5-9)
  - 이유: 카메라 API·Canvas·WebAudio 등 브라우저 네이티브 API가 핵심이라 프레임워크 이득이 적음. 번들 최소화가 중장년 사용자 로딩 속도에 유리
- 카메라: `getUserMedia` + `torch: true` + `requestVideoFrameCallback` + `<canvas>` 프레임 분석
- 신호처리: FFT는 직접 구현 또는 `fft.js` 등 경량 라이브러리
- **모든 처리는 브라우저 내에서만 수행** — 서버 전송 없음 (개인정보 신뢰도 + 서버 비용 0)

## 5-2. i18n 구조 (다국어 확장 전제)
```
src/i18n.js
  └ dictionaries = { ko: {...}, en: {...} }   ← 현재 구현 (키 62개)
    t('key') 로더 · 언어 감지(navigator.language, 기본 ko) · 전환 · localStorage 저장
    validateI18nKeyParity()  ← ko/en 키 집합 일치 검증 (CI 필수 통과 항목)

  ▸ 언어를 추가할 때: dictionaries 에 `ja: {...}` 를 추가하고 키 집합을 맞추면 된다.
```
- **원칙**: 화면 텍스트를 코드에 하드코딩 금지. 전부 `ko.json`/`en.json` 키로 참조
- **키 네이밍**: `result.normal.title`, `result.tachy.desc`, `error.pressHarder` 처럼 **화면.영역.항목** 3단 구조
- **플래시보팅 방지**: `<html lang>` 초기화 후 언어 팩 로드 완료 시 `body` 표시 (FOUC 방지)
- 언어 감지: `navigator.language` → 없으면 `ko` 기본값
- **주의**: 숫자·단위·날짜는 `Intl.NumberFormat` / `Intl.DateTimeFormat` 사용 (예: 영어권 `72 bpm`, 한국어 `72회/분`)
- 번역 누락 방지: CI에서 **ko/en 사전 키 일치 검증** (아래 5-4)

## 5-3. 저장소 / 브랜치 전략
| 저장소 | 역할 | 브랜치 |
|---|---|---|
| **`HeartTune-test`** | 개발·테스트 | `main` (개발) |
| **`HeartTune`** | 운영 (실서비스) | `main` (배포) |

**배포 흐름 (GitHub Actions) — 검증과 이관을 분리 (2026-10-19 개정)**
```
HeartTune-test (main)
      │  push  ──▶ ① Dev CI (ci.yml)
      │             lint + i18n + DSP 단위 + E2E + dist 빌드
      │             ⇒ 운영 배포 없음
      │
      ├─▶ ✅ 검증 전부 통과 시에만 개발 Pages 배포 (GitHub Actions Pages)
      │   https://zzexxous-pixel.github.io/HeartTune-test/   ← 화면 직접 확인
      │
      │  사람이 판단 후 수동 실행  ──▶ ② Promote to Production (promote-to-production.yml)
      │                                ⓪ PROMOTE 확인
      │                                ① 동일 검증 재수행 (verify.yml 재사용)
      │                                ② 검증 통과한 dist/ 만 크로스 리포 push (PAT)
      │                                ③ 운영 URL 스모크 테스트
      ▼
HeartTune (main) → GitHub Pages 자동 배포
      https://zzexxous-pixel.github.io/HeartTune/
```

- 검증 정의는 `.github/workflows/verify.yml` **한 곳**에만 두고 두 워크플로가 `workflow_call` 로 공유한다.
- 운영 반영 트리거는 `workflow_dispatch` **단독**이다. `push`/태그로는 배포되지 않는다.
- 개발 미리보기 역시 검증을 통과한 산출물만 배포된다(저장소 Pages Source = GitHub Actions 전제).
- 운영 이관은 `production` environment 로 기록되며, 필요 시 필수 리뷰어를 붙여 승인 게이트를 추가할 수 있다.

**보안 주의**
- 크로스 리포 push에는 **fine-grained PAT** 또는 **deploy key** 필요 → GitHub Secrets(`ACTIONS_DEPLOY_KEY`)에 저장, 코드에 절대 하드코딩 금지
- `HeartTune-test`는 **private**, `HeartTune`(배포용)만 public 권장

## 5-4. CI 체크 항목 (구현 완료)
- [x] i18n **키 집합 일치** 검증 (누락 시 실패)
- [x] 구문·모듈 lint (ESLint/Prettier 미도입 — `node --check` 기반)
- [x] 신호처리 단위 테스트 15개 (합성 PPG → BPM 회귀, 하모닉 혼동, 리듬 판정)
- [x] Playwright E2E 5개 (렌더링·i18n·측정 플로우·디버그 샌드박스)
- [x] 빌드 산출물 생성 + 경로/자산 검증 + 캐시 버전 자동화

## 5-5. 배포 호스팅 — ✅ 확정: GitHub Pages
- ✅ **GitHub Pages** (무료, Actions와 자연 연계, HTTPS 자동 제공)
- ⚠️ **카메라 API는 HTTPS 필수** — `getUserMedia`는 보안 컨텍스트에서만 동작. GitHub Pages는 `https://<계정>.github.io/...`로 HTTPS 제공하므로 조건 충족
- ⚠️ GitHub Pages는 **public 저장소만 무료** → 운영 `HeartTune`은 public 필요. 개발 `HeartTune-test`는 private 가능
- ⚠️ 커스텀 도메인 사용 시 `CNAME` 설정 + Actions 배포 경로(`cname` 옵션) 주의
- 개발 저장소 Pages 는 **Source = GitHub Actions** 로 두어, 검증 통과분만 배포한다.
- 로컬 개발 시 `http://localhost`는 보안 컨텍스트로 인정되어 카메라 동작함 (단 `http://192.168.x.x`는 차단)

## 5-6. 반응형 설계 — 휴대폰 전용 (PC는 2026-09-11 제외 결정)

**브레이크포인트 (안)** — 휴대폰 세로가 기본, 가로 회전만 보조
| 구간 | 대상 | 레이아웃 |
|---|---|---|
| 기본 | 휴대폰 세로 | 1열. 탭바 하단, 카메라 미리보기 상단 |
| landscape + 저높이 | 휴대폰 가로 | 카메라 16:9로 압축, 가이드 3열 |

> PC 제외 이유: 플래시(torch) 부재, 후면 카메라 부재, 웹캠 초점거리 문제 등
> 손가락 PPG의 광학 조건을 PC가 만족시키기 어렵다. → 5-8 참조

**원칙**
- **모바일 퍼스트** CSS (`min-width` 미디어쿼리로 확장)
- 길이 단위: `rem` + `clamp()` 사용 → `font-size: clamp(3rem, 12vw, 5rem)` 식으로 화면 크기 따라 자동 조절
- 뷰포트: `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수
- **가로/세로 회전 대응**: `orientation` 미디어쿼리로 회전 시 레이아웃 재배치
- PC에서 창 크기를 줄여도 깨지지 않도록 **유동적 그리드** (`grid-template-columns: repeat(auto-fit, minmax(...))`)

## 5-7. 입력 방식 — 마우스 + 터치 동시 지원

**핵심 규칙: 클릭 계열 이벤트만 사용**
- ✅ **`click` 이벤트만 사용** — 브라우저가 마우스 클릭과 터치를 모두 `click`으로 정규화하므로 **자동으로 둘 다 지원됨**
- ❌ `mousedown` / `touchstart` 직접 사용 금지 → **이중 발화(double fire)** 버그 발생
- ❌ `:hover`만으로 상태 표현 금지 → 터치 기기에는 hover가 없어 상태가 안 보임. **`:focus-visible` 병행 필수**

**적용 사항**
| 항목 | 규칙 |
|---|---|
| 탭/클릭 영역 | **최소 48×48px** (중장년 + 터치 공통 요구) |
| 버튼 간격 | 인접 버튼 사이 **8px 이상** (오택 방지) |
| 키보드 접근성 | 모든 조작을 **Tab + Enter**로 가능하게 (PC 사용자·접근성) |
| 확대 | `touch-action` 제한하지 않기 — 중장년 사용자의 **핀치 줌 허용** |
| 드래그/스와이프 | 꼭 필요할 때만 **Pointer Events** 사용 (마우스·터치·펜 통합 처리) |
| 300ms 지연 | `<meta viewport>` 설정으로 자동 해소 (현대 브라우저) |

**측정 중 손가락 위치 이슈 (중요)**
- 손가락 PPG는 **후면 카메라**를 사용하므로, 측정 중 화면을 보며 조작할 수 없음
- → 측정은 **시작 버튼 한 번**으로 완결되게 설계. 중간 조작(취소 등)은 **음성/진동/큰 소리**로 피드백하거나, 화면 가장자리에 큰 취소 영역 배치

## 5-8. ⚠️ 크로스 디바이스 기술 이슈 (PC 지원으로 신규 발생)

#### ① 플래시(torch) — 가장 큰 문제
- 손가락 PPG는 **강한 광원**이 필요해 보통 후면 플래시를 켭니다 (`track.applyConstraints({ advanced: [{ torch: true }] })`)
- **PC에는 플래시가 없습니다.** `torch: true`를 제약조건으로 넣으면 **`OverconstrainedError`로 카메라 자체가 안 열립니다**
- ✅ **해결**: torch는 **제약조건에 넣지 말고**, 카메라를 먼저 연 뒤
  ```js
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities();
  if (caps.torch) await track.applyConstraints({ advanced: [{ torch: true }] });
  ```
  로 **지원 여부 확인 후 켜기** (실패해도 측정은 계속)
- ⚠️ `getCapabilities().torch`는 **Chrome/Edge(모바일 포함)만 지원**, Safari/Firefox는 미지원 → 미지원 시 안내 문구 필요
- ✅ **대안 광원 (수정됨 2026-09-11)**: 초기 설계였던 "화면 전체 흰색"은 두 이유로 폐기.
  ① 전체화면 오버레이가 UI를 가려 노트북 실사용 테스트에서 "흰 화면 고장"으로 보임
  ② 후면 카메라 측정에서는 화면 빛이 카메라 반대편이라 광원 역할 불가
  → 자동 광원 없음. **전면 카메라(웹캠) 기기에서만** 사용자가 토글로 켜는
  **상단 조명 스트립** 제공 (`#btnScreenLight`, `camera.setScreenLight`).
  플래시 미지원 시에는 "밝은 곳에서 측정" 안내 문구로 대체.

#### ② 카메라 방향
- 휴대폰: 후면 카메라(`facingMode: 'environment'`) — 표준
- **PC/태블릿: 전면 웹캠만 있는 경우가 대부분** → `environment` 요구 시 실패
- ✅ **해결**: `environment` 시도 → 실패하면 `user`(전면)로 폴백. 추가로 **`enumerateDevices()`로 카메라 목록 UI** 제공해 사용자가 직접 선택 가능하게
- ⚠️ PC 웹캠은 **초점거리가 멀어** 손가락을 가까이 대면 초점이 안 맞을 수 있음 → "카메라에 손가락을 살짝 떨어뜨려 대보세요" 안내 필요. **PC는 정확도가 낮을 수 있음을 고지**

#### ③ 프레임 수집 API
- `requestVideoFrameCallback`은 **Chrome/Edge/Safari 15.4+ 지원, Firefox 미지원**
- ✅ **해결**: 미지원 시 `requestAnimationFrame` 폴백 (정확한 타임스탬프는 `performance.now()`로 대체)

#### ④ iOS Safari 특이사항
- `playsinline` 속성 없으면 **전체화면으로 강제 전환**됨 → `<video playsinline muted autoplay>` 필수
- 자동재생 정책: **사용자 제스처(버튼 클릭) 이후**에 `getUserMedia` 호출해야 함 → "측정 시작" 버튼 흐름과 자연스럽게 일치
- PWA 설치 프롬프트 자동 표시 안 됨 → 수동 안내 배너 필요

#### ⑤ GitHub Pages 경로(base path)
- 저장소가 `https://<계정>.github.io/HeartTune/` 처럼 **하위 경로**로 배포됨
- ✅ **해결**: 모든 리소스를 **상대경로**로 + 빌드 도구 사용 시 `base: './'` 설정
- Service Worker 등록 경로도 `./sw.js` 형태로 — 절대경로(`/sw.js`)로 하면 404

#### ⑥ 성능 (PC vs 모바일)
- 프레임당 픽셀 연산이 있으므로 **캔버스를 64×64 이하로 축소**해 처리량 확보
- `getImageData`는 매 프레임 비용이 큼 → **10~15fps로 샘플링 제한** 권장 (30fps 전부 안 써도 BPM 계산 충분)


## 5-9. 파일 구조 (2026-10-19 분리)

기존에는 `index.html` 한 파일(약 2,000줄)에 CSS/앱 로직이 모두 들어 있었다.
이제 마크업만 남기고 역할별로 분리했다.

```
index.html                 ← 마크업만 (약 250줄)
src/
  main.css                 ← 스타일 전체 (약 745줄)
  main.js                  ← UI·네비게이션·측정 오케스트레이션
  dsp.js                   ← 신호처리 순수 로직 (DOM 비의존 → Node 테스트 가능)
  i18n.js                  ← ko/en 사전
  features/
    camera.js              ← getUserMedia·torch·장치 목록
    storage.js             ← 측정 이력·캘리브레이션 (localStorage 키 관리)
    share.js               ← 결과 이미지 캔버스 렌더 + Web Share/다운로드
scripts/
  build-dist.js            ← dist 빌드 + 버전 자동화
  serve.js                 ← 의존성 없는 정적 서버
```

**분리 기준**
| 기준 | 배치 |
|---|---|
| DOM 을 전혀 모르는 계산 로직 | `src/dsp.js` (DOM 비의존) |
| 화면 텍스트/포맷 | `src/i18n.js` |
| 하나의 부수효과(카메라, 저장소, 공유)를 캡슐화 | `src/features/*.js` |
| 앱 상태·이벤트·화면 갱신 | `src/main.js` |

**주의**
- 새 파일을 추가하면 `sw.js` 의 `ASSETS` 와 `scripts/build-dist.js` 의 `RUNTIME_FILES` **양쪽**에 등록해야 한다. (빌드가 누락을 검사해 실패시켜 준다)
- `index.html` 이 `./` 상대경로로만 자산을 참조해야 GitHub Pages 하위 경로에서 동작한다.

---
