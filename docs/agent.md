# agent.md — 오늘심박(HeartTune) 에이전트 인수인계 문서

> **이 문서를 읽는 AI 에이전트에게**
> 이 저장소의 작업을 이어받았다면, 아래 "0. 첫 5분 체크리스트"를 순서대로 실행한 뒤
> 5~7절(현재 상태 / 할 일 / 미결정)을 확인하고 작업을 시작하세요.
> 대화 기록은 사라져도 이 문서와 저장소(코드·PR·커밋)는 남습니다. **여기가 유일한 기억입니다.**

- 최종 갱신: 2026-10-19 (KST) — 원스크린(한 화면) UX 개편 반영
- 갱신자: Arena 에이전트 세션 `arena/f50fd973-hearttune-test` (이전 PR #1, #2 → Promote 첫 성공)
- 저장소: `zzexxous-pixel/HeartTune-test` (개발) / `zzexxous-pixel/HeartTune` (운영)

---

## 0. 첫 5분 체크리스트 (새 세션이 가장 먼저 할 일)

```bash
git log --oneline -10                 # 최근에 무슨 일이 있었는지
git status -sb                        # 미커밋 변경이 있는지
npm run lint && npm run test:i18n     # 구문 / i18n 키
npm run test:unit                     # DSP 단위·회귀 (현재 15개)
npm run build                         # 배포 산출물 + 경로/자산 검증
```

그 다음 읽기 순서:

1. `docs/40-deployment-guide.md` — **배포/CI 구조(가장 중요)** — 특히 **8-1절(이관 ③ 개선)** 필독
2. `docs/20-architecture.md` §5-9 — **파일 구조와 책임 경계**
3. `docs/30-algorithm-dsp.md` — **신호처리 설계와 왜 그렇게 했는지**
4. `docs/10-spec.md`, `docs/00-brand-concept.md` — **제품 원칙과 금지 표현**
5. `git log -p -- src/dsp.js` — 최근 DSP 변경의 실제 의도

> E2E는 브라우저 설치가 필요합니다: `npx playwright install --with-deps chromium` → `npm run test:e2e`

---

## 1. 프로젝트 정의 (거의 바뀌지 않음)

| 항목 | 값 |
|---|---|
| 이름 | **오늘심박 (HeartTune)** — "오늘 내 심장, 30초면 충분해요" |
| 형태 | **1페이지 SPA 웹앱**, 프레임워크 없음(Vanilla JS + ES Modules), 빌드 번들러 없음 |
| 핵심 기능 | 스마트폰 후면 카메라 + 플래시로 **손가락 PPG** 측정 → BPM + 리듬(부정맥 아님) 참고 정보 |
| 측정 시간 | 기본 30초 / 15초(빠른 확인, 리듬은 참고) / 60초(정밀) |
| 표시 규칙 | 0~15초는 값 숨김 → **15초에 첫 BPM** → 이후 2초 주기 갱신 → 종료 시 최종 확정 + 리듬 1회 판정 |
| 저장 | `localStorage`만 (서버 없음, 영상 전송 없음) |
| 공유 | 결과를 **큰 글씨 PNG**로 생성 → Web Share / 다운로드 |
| 타깃 | **중장년** (+ 자녀가 부모님 확인) |
| 언어 | ko 기본 / en (i18n 키 81개, 구조로 다국어 확장 가능) |
| 호스팅 | GitHub Pages (HTTPS 필수: 카메라 API) |

---

## 2. 절대 원칙 (INVARIANTS — 위반 금지)

### 2-1. 제품·의료 표현
1. **"진단"이라는 단어를 쓰지 않는다.** → "정상 범위예요", "리듬이 고르지 않아요" 수준
2. 결과는 **참고용 정보**임을 항상 병기한다 (`legal.disclaimer.main`).
3. 부정맥을 단정하지 않는다. "부정맥입니다" ❌ / "리듬이 고르지 않아요. 의사와 상담해 보세요" ⭕
4. 카메라 영상은 **브라우저 밖으로 나가지 않는다**. 서버 전송·외부 API 호출 금지.
5. 영문 표기는 **`HeartTune`** (가운데 띄어쓰기·하이픈 금지).

### 2-2. 접근성·UX (중장년)
- **첫 화면은 100dvh 한 화면(스크롤 없음)** — 옵션·이력·안내·기술 지표는 바텀시트로만 (10-spec 4-5b)
- 기본값은 **후면 카메라 / 30초 / 자동 시작 OFF / 파형 ON / 화면 조명 ON**, 언어는 **브라우저 언어**
- 카메라 미리보기 **54px 변경 금지** (사용자 지정)
- 헤더 순서는 **[≡ 메뉴] [❤️ 로고] [EN] [⚙️]** — 로고가 남는 공간을 차지한다.
- 기본 글자 **18px 이상**, 핵심 수치(BPM) **64px 이상**
- 탭 영역 최소 **48×48px**, 인접 버튼 간격 8px 이상
- 상태를 **색만으로** 전달 금지 → 색 + 아이콘 + 문구 동시 사용
- 이벤트는 **`click` 단일화** (`mousedown`/`touchstart` 직접 사용 금지 → 이중 발화 버그)
- `:hover` 단독 상태 표현 금지 → `:focus-visible` 병행

### 2-3. 코드 구조
| 규칙 | 이유 |
|---|---|
| `src/dsp.js`·`src/i18n.js` 는 **DOM을 모른다** | Node 단위 테스트 가능해야 함 |
| 새 파일 추가 시 `sw.js`의 `ASSETS` **와** `scripts/build-dist.js`의 `RUNTIME_FILES` **양쪽** 등록 | 누락 시 오프라인/배포에서 404. 빌드가 검사해 실패시킴 |
| 모든 자산 참조는 **`./` 상대경로** | GitHub Pages 하위경로(`/HeartTune/`) 호환. 절대경로는 빌드가 거부 |
| 화면 문구는 **하드코딩 금지** → `src/i18n.js` 키 | ko/en 키 집합 일치가 CI 필수 통과 항목 |
| `sw.js`의 `CACHE_NAME` **수동 수정 금지** | 빌드가 내용 해시로 자동 교체함 |

### 2-4. 배포
- **개발 커밋은 운영에 절대 자동 반영되지 않는다.**
- 운영 반영은 `② Promote to Production (HeartTune)` **수동 실행(workflow_dispatch)** 만. `confirm=PROMOTE` 필수.
- `ci.yml`(① Dev CI)에 운영 배포 스텝을 **추가하지 않는다.**
- 검증 정의는 `verify.yml` **한 곳**만 수정한다(두 워크플로가 공유).

---

## 3. 저장소 / 배포 지도

```
[개발] HeartTune-test (main)   ← github.dev(. 키)로 편집·커밋
   │  push
   ▼
① Dev CI (ci.yml)  →  verify.yml 재사용
   ├ 검증① lint · i18n · DSP 단위(15)
   ├ 검증② Playwright E2E(7)
   ├ 검증③ dist 빌드(+경로/자산 검증, 캐시 해시 자동)
   └ ✅ 전부 통과 시에만 → 개발 미리보기 배포 (GitHub Actions Pages)
        https://zzexxous-pixel.github.io/HeartTune-test/

   PR 은 별도 `preview-pr.yml` 이 검증 산출물을 `/preview/` 에 배포한다. 루트는 최신 main 빌드로 유지한다.
   │
   │  사람이 화면 확인 후 판단
   ▼
② Promote to Production (promote-to-production.yml)  ← workflow_dispatch 전용
   ⓪ confirm=PROMOTE 검사
   ① 동일 검증 재수행 (verify.yml)
   ② 통과한 dist/ 만 HeartTune(main) 으로 push (PAT)
   ③ 운영 URL 스모크 테스트 (기대 빌드 해시 + 자산 10종 + 구버전 판별, 10분 폴링/timeout 20분)
   ▼
[운영] HeartTune (main) → https://zzexxous-pixel.github.io/HeartTune/
```

| 항목 | 개발 | 운영 |
|---|---|---|
| Pages Source | **`GitHub Actions`** 여야 함(검증 게이트) | **`Deploy from a branch` / `main` / `(root)`** |
| 배포 주체 | `ci.yml`의 `deploy-dev-preview` 잡 | `promote-to-production.yml`의 `publish` 잡 |
| 비밀값 | `ACTIONS_DEPLOY_PAT` (운영 저장소 Contents: RW) — **등록 완료(2026-10-19 사용자 확인)** | — |

> ⚠️ **에이전트 권한 한계**: Arena 세션 토큰으로는 **workflow 수동 실행(dispatch)·Pages 설정 변경·Secrets 조회**가 403으로 막힙니다.
> 이 세 가지는 **사용자에게 요청**하고, 에이전트는 코드/문서/로컬 검증까지만 담당합니다.

### 3-1. 세션 ↔ 브랜치 ↔ PR 운영 방식

- **1세션 = 1브랜치 = 1PR** 로 작업한다. 이 저장소 세션에서 사용하는 브랜치는 `arena/c85567d7-hearttune-test` 이다.
- 한 세션에서 커밋을 여러 개 쌓을 수 있지만, **머지는 마지막에 1회**만 한다. 머지 후에는 해당 세션에서 추가 변경이 있더라도 로컬 커밋까지만 가능하며 원격 푸시/PR을 이어서 만들지 않는다. 필요한 후속 작업은 새 세션/PR로 진행한다.
- 머지 전 화면 확인은 아래 세 곳을 모두 기준으로 삼는다.

| 확인 | 주소/명령 | 목적 |
|---|---|---|
| ① PR 미리보기 | `https://zzexxous-pixel.github.io/HeartTune-test/preview/` | PR 코드가 최신 main 루트를 덮어쓰지 않고 표시되는지 확인 |
| ② 로컬 미리보기 | `npm run preview` → `http://localhost:8080/` | 서비스 워커 캐시 없이 현재 작업본 확인 |
| ③ 머지 후 개발 페이지 | `https://zzexxous-pixel.github.io/HeartTune-test/` | Dev CI 성공 후 최신 main 루트 반영 확인 |

- PR 을 **병합하지 않고 닫으면** `preview-pr.yml` 의 `cleanup-preview` 가 최신 main 을 다시 배포해 `/preview/` 를 제거한다.

---

## 4. 파일 구조와 책임 경계

| 파일 | 줄 수(참고) | 책임 | 테스트 |
|---|---|---|---|
| `index.html` | ~400 | **마크업만** (원스크린 + 바텀시트 6종) | E2E |
| `src/main.css` | ~900 | 원스크린 레이아웃·시트·디버그 리사이즈, 중장년 접근성 | E2E |
| `src/main.js` | ~900 | 앱 상태·이벤트·측정 오케스트레이션·시트 연결 | E2E |
| `src/dsp.js` | ~816 | PPG 신호처리 순수 로직 (DOM 비의존) | **단위 15개** |
| `src/i18n.js` | ~240 | ko/en 사전(81키), `t()`, **브라우저 언어 기본 감지**, 키 일치 검증 | 단위 1번 + `test:i18n` |
| `src/features/camera.js` | ~150 | `getUserMedia`·torch·전/후면 전환·**진입 미리보기** | E2E 간접 |
| `src/features/sheets.js` | ~95 | 바텀시트 열기/닫기·포커스 트랩·ESC·백드롭 | E2E |
| `src/features/storage.js` | ~114 | 이력·캘리브레이션 localStorage 키/용량 관리 | 간접 |
| `src/features/share.js` | ~120 | 결과 PNG 생성 + Web Share/다운로드 | — |
| `scripts/serve.js` | ~63 | **의존성 0** 정적 서버(로컬·E2E) | — |
| `scripts/build-dist.js` | ~143 | dist 생성 + 빌드 해시 + 캐시 자동화 + 경로/자산 검증 | `npm run build` |
| `sw.js` | ~75 | 오프라인. 문서=네트워크 우선, 자산=캐시 우선 | — |
| `tests/dsp.test.js` | ~233 | DSP 회귀 15개 | `test:unit` |
| `tests/e2e/hearttune.spec.js` | ~250 | E2E 7개 | `test:e2e` |

**분리 기준**: DOM 모름 → `dsp.js` / 화면 문구 → `i18n.js` / 부수효과 1개 캡슐화 → `features/*` / 앱 상태·이벤트 → `main.js`

---

## 5. 현재 상태 🟢 — 매 작업 시 갱신

> **갱신 규칙**: 값을 바꾼 뒤 **반드시 해당 명령을 다시 실행**해 확인하고, 날짜를 함께 적는다.
> 오래된 숫자는 믿지 말고 명령으로 재확인한다.

| 항목 | 값 | 검증 명령 | 확인일 |
|---|---|---|---|
| 최신 main 커밋 | `fded047` (PR #3 머지 완료) | git log --oneline -5 | 2026-10-19 |
| DSP 단위·회귀 | 15 / 15 통과 | npm run test:unit | 2026-10-19 |
| Playwright E2E | 7 / 7 통과 (PR #4 GitHub Actions) | `verify.yml` → Playwright E2E | 2026-10-20 |
| i18n 키 | 81개, ko/en 일치 | npm run test:i18n | 2026-10-19 |
| 개발 배포 빌드 | `b5ad15d2` 서빙 중 | 개발 Pages 빌드 메타 확인 | 2026-10-19 |
| dist 빌드 | 11개 파일, 빌드 해시 자동 | npm run build | 2026-10-19 |
| 워크플로 | ci / verify / promote-to-production / preview-pr (PR #4 미리보기 배포 성공; main 루트 유지 확인) | Actions run #39353161406 + 개발 Pages / `/preview/` | 2026-10-20 |
| ① Dev CI (main) | success | Actions 탭 | 2026-10-19 |
| ② Promote | ✅ 첫 이관 성공 (Re-run 1회로 성공) | Actions → ② 실행 이력 | 2026-10-19 |
| 운영 배포 | ✅ 서빙 중 — https://zzexxous-pixel.github.io/HeartTune/ · 빌드 91282438 (`<meta name="hearttune-build" content="91282438">` 확인) | 운영 URL 소스에서 meta hearttune-build 확인 | 2026-10-19 |
| 이관 ③ 로직 | ✅ 개선 완료(지속 체계) — 빌드 해시 판정 / 10분 폴링·진단 로그 / 자산 10종 각 1분 재시도 + 내용 해시 검증(모든 자산에 `hearttune-build` 주입, 시간 미의존) / Summary Re-run 안내 / timeout-minutes 20 | `scripts/build-dist.js`·`promote-to-production.yml`·docs/40 8-1절 | 2026-10-19 |
| 개발 Pages Source | `GitHub Actions` (workflow) | 저장소 Pages 설정 | 2026-10-19 |
| 운영 Pages Source | ✅ Deploy from a branch / main / (root) | gh api repos/OWNER/HeartTune/pages --jq .source | 2026-10-19 |
| 실측(실제 카메라) 튜닝 | ❌ 미완 — 사용자 실기기 확인 대기 | — | 2026-10-19 |

### 최근 해결한 주요 이슈 (재발 방지용 요약)

1. **DSP 하모닉 혼동 (2026-10-19 해결)** — PPG 중첩파로 2차 하모닉이 기본파보다 커지면
   FFT가 2배 BPM을 선택 → 트래킹 필터가 잘못 좁혀져 박동이 2배 검출 → "리듬 불규칙" 오판.
   → `resolveBpmEstimate()` 도입: FFT·자기상관·IBI중앙값 **합의 우선, 불일치 시 시간영역 중재**.
   회귀 테스트 13~15번이 이 케이스를 고정함. **이 로직을 건드리면 13~15번을 먼저 보라.**
2. **CI 실패 원인 불투명** → E2E는 `list` 리포터 + 실패 로그를 Step Summary/PR 코멘트로 게시.
3. **불필요한 다운로드** → `npx --yes serve` 제거, `scripts/serve.js`(의존성 0) 사용.
4. **캐시 수동 관리** → 빌드 해시로 `CACHE_NAME` 자동 교체.
5. **이관 ③ 스모크 불안정 (2026-10-19 개선 → 2026-10-19 지속 체계)** — "오늘심박" 문구 판정은 이전 빌드와 구분 불가 + Pages 전파 지연으로 5분 폴링 부족 + 자산 일시 404 + 구버전 서빙 미감지(시간/Last-Modified로는 구분 불가).
   → 빌드 해시(`hearttune-build` 메타) 판정 / 10분 폴링·현재 빌드/README 진단 로그 / 자산 10종 각 1분 재시도 + **모든 자산 내용에 동일 해시 주입으로 신/구버전 판별**(`build-dist.js`가 JS/CSS/sw.js에 `/* hearttune-build: 해시 */`, manifest에 `_build` 필드 주입) / 실패 시 Summary에 "이관 ②는 이미 완료됐을 수 있음 + Re-run failed jobs 안내" / timeout 20분. 상세는 `docs/40-deployment-guide.md` 8-1절.

---

## 6. 할 일 (TODO) 🔄 — 매 작업 시 갱신

우선순위: **P0 = 지금 막혀 있음 / P1 = 다음 / P2 = 여유**

| # | 우선 | 할 일 | 비고 |
|---|---|---|---|
| 1 | P1 | PR 미리보기 cleanup 실배포 확인 | PR #4 `/preview/` 배포와 main 루트 유지 확인 완료. 미병합 close 시 정리는 PR을 리뷰 중이므로 아직 실행하지 않음; 향후 미병합 PR 종료 시 `cleanup-preview` 확인 |
| 2 | P1 | 이관 ③(smoke) 로직 개선 커밋 반영 | ✅ 완료(2026-10-19) — **지속 체계**: 빌드 해시 판정 / 10분 폴링·진단 로그 / 자산 10종(각 1분 재시도) + 모든 자산 내용에 `hearttune-build` 해시 주입(`build-dist.js`)으로 신/구버전 판별(시간 미의존) / Summary Re-run 안내 / timeout 20분 → `promote-to-production.yml`·`build-dist.js`·`docs/40` 8-1절 정리. PR 후 ② 재실행 시 안정성 검증 대기 |
| 3 | P1 | 실기기(iOS/Android) 검증 결과 반영 | 원스크린 UI + 진입 카메라 미리보기가 iOS Safari/PWA에서도 동작하는지 확인 |
| 4 | P1 | 실제 카메라 신호로 DSP 튜닝 | 디버그 콘솔 CSV 활용 |

**완료 표시 규칙**: 끝난 항목은 지우지 말고 `✅ 완료(날짜)` 로 바꿔 아래 "8. 세션 로그"로 옮긴다.

---

## 7. 미결정 / 사용자 확인 필요

| 항목 | 선택지 | 결정 |
|---|---|---|
| 색상 테마 | 차분한 의료 블루(현재) / 다크+레드 / 민트 파스텔 | **미정** (현재 블루) |
| 원스크린 UI | 3단(헤더/스테이지/CTA) + 시트 | ✅ 확정(2026-10-19) — 10-spec 4-5b |
| 자동 시작 | OFF(버튼 필요) / 손가락 감지 시 자동 | ✅ **OFF** 확정 |
| 카메라 진입 미리보기 | 페이지 진입 즉시 ON / 측정 시작 시 ON | ✅ **진입 즉시 ON** 확정(토치 OFF) |
| 이력 보관 개수 | 200건(현재) / 100건 / 무제한(불가) | 200건 임시 |
| 15초 측정의 리듬 노출 | 참고 문구만 / 숨김 | 참고 문구(현재) |
| 전면 카메라 폴백 안내 문구 | 현재 `error.webcam.notice` 사용 | 재검토 여지 |
| 커스텀 도메인 | 미사용 | — |
| 운영 저장소 README 처리 | 첫 이관 시 사라짐(현재 설계) | 재확인 필요 |

> **원칙**: 제품 문구·판정 기준처럼 사용자 감각이 필요한 결정은 **임의로 확정하지 말고 질문**한다.
> 반대로 구현 세부(변수명, 파일 분리, 테스트 구조)는 에이전트가 결정한다.

---

## 8. 알려진 함정 (Pitfalls) — 시간 절약용

### 테스트
- **E2E 로케일**: `navigator.language` 로 언어를 자동 감지하므로, 로케일을 고정하지 않으면 **영어 UI로 검증**되어 실패한다. `playwright.config.js`에 `locale: 'ko-KR'` 지정됨.
- **디버그 콘솔 오버레이**: 콘솔을 열어두면 하단 Primary CTA를 가려 클릭이 차단된다. 테스트/수동 확인 시 **닫고** 측정 시작.
- **가짜 시계(`page.clock.install()`)**: CSS transition이 멈춰 스크린샷의 색/위치가 실제와 다르게 보인다. 스크린샷 검증 시 `transition:none` 주입.
- **헤드리스 카메라**: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` 필요. 없으면 카메라 오류.
- **CI 브라우저**: `npx playwright install --with-deps chromium` 없이는 E2E 불가.

### 빌드·배포
- `sw.js` `CACHE_NAME` 수동 수정 금지 — 빌드가 덮어쓴다.
- `dist/` 는 `.gitignore` 대상. **커밋하지 않는다.**
- 새 파일은 `sw.js ASSETS` + `build-dist.js RUNTIME_FILES` **둘 다** 등록. 하나만 하면 오프라인/배포에서 404.
- 개발 저장소 Pages가 `legacy`면 **테스트 실패 커밋도 화면에 배포**된다. `build_type` 확인.
- 운영 저장소는 반대로 **브랜치 배포**를 써야 한다(설정을 개발/운영 혼동 주의).
- **이관 ③(스모크) 실패 시**: 운영 저장소에 `release: ...` 커밋이 이미 생겼다면 이관 ②는 성공한 것 — Pages 전파 지연이므로 **Re-run failed jobs**로 ③만 재실행하면 된다(전체 재실행 불필요). 로그의 "현재 서빙 빌드 / README 감지"와 Summary 안내를 확인하라(8-1절).

### DSP
- 단위 테스트는 **합성 신호**다. 합성 생성기의 중첩파 진폭(1.4)은 실제와 다를 수 있으므로, 실측 튜닝 시 지표를 그대로 신뢰하지 말 것.
- `filterState.locked`/`tuningMode`(wide/tracking/hold/prior-fallback/manual) 흐름을 이해하지 않고 트래킹 공식을 바꾸면 곧바로 회귀한다.
- CV 임계값 **0.14**는 임상 검증값이 아니라 잠정값이다(규칙 0.04 vs 불규칙 0.22 사이).

### 환경
- Arena 세션: **push/PR/머지/workflow dispatch/Settings 변경 불가**(세션 종료 후). 코드·문서·로컬 테스트만 가능.
- 네트워크 제한 환경에서는 `npx playwright install` 이 실패할 수 있다 → 기존 Chromium을 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 로 지정하는 경로가 이미 지원됨.

---

## 9. 작업 표준 절차 (Definition of Done)

어떤 작업이든 아래를 **모두** 만족해야 "끝난 것"으로 본다.

1. `npm run lint` 통과
2. `npm run test:i18n` 통과 (문구 추가/삭제 시 ko·en **둘 다**)
3. `npm run test:unit` 통과 (**DSP 로직 변경 시 새 회귀 테스트 추가**)
4. `npm run test:e2e` 통과 (UI 흐름 변경 시 E2E 갱신)
5. `npm run build` 통과 (새 파일이면 `RUNTIME_FILES`/`ASSETS` 등록 후)
6. 화면 변경 시 **실제 렌더링 확인** (스크린샷 또는 `npm run serve`)
7. 문서 갱신: 해당되면 `docs/30`(알고리즘)·`docs/20`(구조)·`docs/40`(배포)
8. **이 문서 갱신**: 5절(상태)·6절(할 일)·7절(미결정)·10절(세션 로그)

### 커밋 메시지 규칙
`type(scope): 요약` + 본문에 **왜** 그렇게 했는지. type: `fix`, `feat`, `ci`, `test`, `docs`, `refactor`, `perf`.

### PR 규칙
- `main` 대상. PR 본문에 **변경 이유 / 검증 방법 / 사용자 조치 필요 여부**를 적는다.
- 사용자가 명시적으로 승인한 경우에만 머지한다(Arena 세션 규칙: 승인 항목 머지 가능).

---

## 10. 세션 로그 (append-only)

| 날짜 | 작업 | 결과 | 관련 커밋/PR |
|---|---|---|---|
| 2026-10-19 | CI/CD 분리: Dev CI(검증만) + 수동 Promote(운영 이관) | 완료 | PR #1 |
| 2026-10-19 | DSP 하모닉 혼동 수정, index.html 분리, 캐시 버전 자동화, serve.js | 완료 (15/15, 5/5) | `d78b29f` |
| 2026-10-19 | Pages 설정 경고 어노테이션 추가 + 문서 갱신 | 완료 | PR #2, `82c67de` |
| 2026-10-19 | 개발 화면 시뮬레이션 렌더링 확인 → 카메라 선택 빈칸 등 UI 결함 7건 수정 | 완료 | `d78b29f` |
| 2026-10-19 | 운영 첫 이관 대기 (Pages 설정 + ② 실행은 사용자 작업) | **대기** | — |
| 2026-10-19 | ② Promote 첫 이관 성공 (Re-run 1회) — 운영 https://zzexxous-pixel.github.io/HeartTune/ 빌드 91282438 서빙 중 | ✅ 완료 | Actions 실행 이력, HeartTune `release: main from HeartTune-test (91282438)` |
| 2026-10-19 | 이관 ③(smoke) 로직 개선 — 빌드 해시 판정 / 10분 폴링·진단 로그 / 자산 10종 재시도 / `createCameraController` 구버전 판별 / Summary Re-run 안내 / timeout 20분 | ✅ 완료(로컬) — `promote-to-production.yml` 반영, `docs/40-deployment-guide.md` 8-1절 정리, 로컬 검증(lint/i18n/unit/build) 통과, `agent.md` 5·6·10절 갱신 | `arena/f50fd973-hearttune-test` 브랜치 (PR 대기) |
| 2026-10-19 | 이관 ③ 지속 체계로 전환 — `createCameraController` 1회용 마커 제거 → 모든 자산에 빌드 해시 주입(`build-dist.js`) + 내용 기반 검증으로 교체 (시간 미의존) | ✅ 완료(로컬) — `scripts/build-dist.js` 모든 자산에 `hearttune-build` 주입·`manifest._build` 추가, `promote-to-production.yml` 자산 해시 검증으로 교체, `docs/40`·`agent.md` 갱신, 빌드 91282438 재검증 통과 | `arena/f50fd973-hearttune-test` 브랜치 |

| 2026-10-19 | **원스크린 UX 개편** — 탭/설정카드/파형/지표/법적푸터를 첫 화면에서 제거하고 헤더·스테이지·하단 CTA 3단 `100dvh` 구성. ⚙️ 설정 시트·≡ 메뉴 시트·이력/안내/법적고지/상세 시트 신설(`src/features/sheets.js`). 후면 카메라 기본 + **진입 즉시 미리보기**(토치 OFF), 자동 시작 OFF, 브라우저 언어 기본, 결과 배너에 법적 고지, 디버그 창 상단 드래그 리사이즈(`--debug-height`) | ✅ 완료(로컬) — i18n 81키 / unit 15 / E2E 7(320×568~414×896·가로모드 스크롤 0 검증) / build 통과 | `arena/f50fd973-hearttune-test` 브랜치 |
| 2026-10-19 | UI 가독성·헤더/설정 기본값 조정, PR `/preview/` 배포와 cleanup, `npm run preview --no-sw` 구현 | lint/i18n 81/unit 15/15/build 11 files 및 PR E2E 7/7 통과. `github-pages`에서 main + `refs/pull/*/merge` 허용 후 `/preview/` 배포 성공, 개발 루트는 main 콘텐츠 유지 확인. close cleanup은 PR 리뷰 중으로 미검증 | PR #4 · `arena/c85567d7-hearttune-test` |

> **로그 규칙**: 최신이 아래. 항목이 20개를 넘으면 오래된 것은 `docs/changelog-archive.md` 로 옮긴다.

---

## 11. 이 문서 자체의 규칙

1. **상태(5·6·7·10절)는 항상 날짜와 함께** 적는다. 날짜 없는 상태는 신뢰하지 않는다.
2. **추측을 사실처럼 쓰지 않는다.** 확인하지 못한 것은 `⚠️ 미확인` 으로 표시한다.
3. **문서 간 충돌 시 우선순위**:
   `실행 결과(테스트/CI)` > `소스 코드` > `docs/30·20·10` > `이 문서의 상태 절` > `00-brand-concept`
   (충돌을 발견하면 코드를 고치거나 문서를 고치고, **어느 쪽을 왜 따랐는지 커밋 메시지에 남긴다**)
4. 4절(함정)은 **실제로 시간을 낭비한 것만** 추가한다. 추측성 주의사항으로 채우지 않는다.
5. 분량이 커지면 5·6·7절을 `docs/agent-state.md` 로 분리하고 이 문서는 링크만 남긴다.
6. 이 문서는 **빌드 대상이 아니다**(`sw.js`/`build-dist.js` 등록 불필요).
