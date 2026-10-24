# 40 · 배포, CI/CD 및 저장소 운영 가이드

> 오늘심박 (HeartTune) — 개발 검증과 운영 이관을 **분리**한 워크플로 운영 문서.
> 최종 업데이트: 2026-10-24

---

## 0. 한눈에 보는 구조

```
 [개발] HeartTune-test (main)
    │  github.dev(. 키) 또는 웹에서 커밋
    ▼
 ① Dev CI (HeartTune-test)                    ← ci.yml → verify.yml
    ├─ lint / i18n 키 일치 / 단위·회귀(24) / Playwright E2E(18) / dist 빌드
    │
    ├─ ❌ 하나라도 실패 → 여기서 끝. 개발 화면도 갱신되지 않음
    │
    └─ ✅ 전부 통과 → 개발 미리보기 배포 (GitHub Actions Pages)
                      https://zzexxous-pixel.github.io/HeartTune-test/
    │
    │  👀 화면 직접 확인 · 계속 수정 (몇 번을 반복해도 운영은 그대로)
    │
    │  ✅ "이 정도면 되겠다" 판단 → 사람이 직접 실행
    ▼
 ② Promote to Production (HeartTune)          ← promote-to-production.yml
    ├─ 이관 ⓪ 확인(PROMOTE 입력)
    ├─ 이관 ① 개발 CI와 동일한 검증 재수행
    ├─ 이관 ② 검증 통과한 dist/ 만 HeartTune(main) 으로 push
    └─ 이관 ③ 운영 URL 스모크 테스트
    ▼
 [운영] HeartTune (main) → https://zzexxous-pixel.github.io/HeartTune/
```

**핵심 원칙**

| 원칙 | 내용 |
| :--- | :--- |
| 개발 커밋은 운영을 건드리지 않는다 | `ci.yml`에는 운영 배포 스텝이 없다. |
| 개발 화면도 검증 통과 후에만 갱신 | 테스트가 실패하면 미리보기 배포 잡이 실행되지 않는다. |
| 운영 반영은 100% 수동 | `promote-to-production.yml`은 `workflow_dispatch` **단독** 트리거. |
| 검증 없이는 못 나간다 | 이관 워크플로가 **같은 검증을 다시 수행**하고, 통과한 산출물만 배포한다. |
| 두 검증은 같은 정의를 쓴다 | 공통 검증은 `verify.yml`(재사용 워크플로) 한 곳에만 존재한다. |

---

## 1. 워크플로 3종

| 파일 | 이름(Actions 탭) | 트리거 | 역할 |
| :--- | :--- | :--- | :--- |
| `.github/workflows/ci.yml` | **① Dev CI (HeartTune-test)** | main push / main 대상 PR / 수동 | 검증 + **검증 통과 시 개발 미리보기 배포** |
| `.github/workflows/promote-to-production.yml` | **② Promote to Production (HeartTune)** | **수동(workflow_dispatch)만** | 검증 후 운영 저장소로 이관 |
| `.github/workflows/verify.yml` | Verify (reusable) | `workflow_call` (직접 실행 불가) | 위 둘이 공유하는 검증 정의 |

---

## 2. 최초 1회 설정 (필수)

### 2-1. 개발 저장소 — Pages 소스를 "GitHub Actions" 로

**Settings → Pages → Build and deployment → Source = `GitHub Actions`**

- 이 설정이어야 **테스트를 통과한 산출물만** 개발 화면에 배포됩니다.
- `Deploy from a branch` 로 두면 커밋할 때마다(테스트 실패와 무관하게) 화면이 바뀝니다.
  이 경우 `① Dev CI` 실행 화면에 **경고(annotation)** 가 표시됩니다: "Pages 설정 변경 필요".
- 웹 UI에서 바꾸기 어려우면 아래 한 줄로도 됩니다(저장소 관리자 권한 PAT 필요):

```bash
gh api -X PUT repos/<OWNER>/HeartTune-test/pages -f build_type=workflow
```

- 확인: `gh api repos/<OWNER>/HeartTune-test/pages --jq .build_type` → `workflow` 이면 정상
- 운영 저장소(`HeartTune`)는 그대로 **Deploy from a branch / `main` / `(root)`** 를 사용합니다.

### 2-2. 운영 저장소 쓰기 권한 PAT

1. **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Repository access: **`HeartTune`** 지정
3. Permissions: **Contents: Read and write**, **Pages: Read and write**
4. 생성된 `github_pat_...` 복사

### 2-3. 개발 저장소 Secret 등록

**`HeartTune-test` → Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
| :--- | :--- |
| `ACTIONS_DEPLOY_PAT` | 위에서 복사한 PAT |

---

## 3. 개발 사이클 (① Dev CI)

1. `HeartTune-test` 저장소에서 **`.`(마침표) 키** → `github.dev`(웹 VS Code)
2. 수정 → 커밋 → **`main` 푸시**
   - `github.dev`는 터미널이 없어 테스트를 직접 돌릴 수 없습니다. **Actions가 대신 수행**합니다.
   - `github.dev`는 태그 생성이 불가하므로 이 프로젝트는 태그 릴리스를 쓰지 않습니다.
3. **Actions → ① Dev CI (HeartTune-test)** 에서 결과 확인
   - `검증 ① lint · i18n · DSP 단위테스트`
   - `검증 ② Playwright E2E`
   - `검증 ③ 배포 산출물 빌드`
   - `개발 미리보기 배포` ← **검증 전부 통과 시에만 실행**
4. **개발 화면 확인**: https://zzexxous-pixel.github.io/HeartTune-test/
   - 배포된 빌드 번호는 화면 소스의 `<meta name="hearttune-build" content="...">` 로 확인할 수 있습니다.
   - 휴대폰에서 열어 실제 카메라 동작까지 확인하는 것을 권장합니다.
5. 마음에 들 때까지 2~4를 반복합니다. **이 단계에서 운영은 절대 바뀌지 않습니다.**

### 브랜치로 작업하는 경우

PR을 `main` 으로 올리면 `pull_request` 트리거로 동일한 검증이 돌아갑니다.
E2E가 실패하면 **실패 로그가 PR 코멘트로 자동 게시**됩니다.

---

## 4. 운영 이관 절차 (② Promote to Production)

1. GitHub → **Actions** → **② Promote to Production (HeartTune)** → **Run workflow**
2. 입력
   - **Use workflow from**: `main`
   - **confirm**: `PROMOTE` (틀리면 ⓪ 단계에서 즉시 중단)
   - **release_note** (선택): 운영 저장소 커밋 메시지
3. 실행

| 단계 | 내용 | 실패 시 |
| :--- | :--- | :--- |
| 이관 ⓪ 확인 | `confirm == PROMOTE` 검사 | 아무 것도 배포되지 않음 |
| 이관 ① 소스 재검증 | 개발 CI와 **완전히 동일한** 검증 | 운영 반영 중단 |
| 이관 ② 운영 저장소 반영 | `dist/` → `HeartTune`의 `main` push (PAT) | 운영 반영 중단 |
| 이관 ③ 운영 배포 확인 | 운영 URL의 **기대 빌드 해시**(`<meta name="hearttune-build">`) + **모든 자산(12종) 내용에 동일 해시 포함 여부**로 신/구버전 판별(시간 의존 없음) — **최대 10분 폴링, 잡 타임아웃 20분** | 실패 표시. **Summary 안내 확인 → Re-run failed jobs로 ③만 재실행** (8-1절) |

### 결과 확인

- **Actions 실행 화면** — 단계별 성공/실패
- **실행 Summary** — 결과·소스 커밋 SHA·운영 URL·운영 저장소 커밋 링크. ③ 실패 시 "이관 ②는 이미 완료됐을 수 있음 + Re-run 안내"가 함께 표시됩니다.
- **HeartTune 저장소 → Commits** — `release: main from HeartTune-test (<sha>)` 1건씩 누적(이력 보존)
- **운영 화면** — https://zzexxous-pixel.github.io/HeartTune/

> `production` environment 로 기록됩니다. Settings → Environments → `production` 에 **Required reviewers** 를 걸면 2차 승인 절차가 추가됩니다.

### 롤백

운영 저장소 이력이 남으므로, 되돌릴 시점의 `HeartTune-test` 상태로 되돌린 뒤 ②를 다시 실행하거나 운영 저장소에서 `git revert` 합니다.

---

## 5. 빌드·버전 자동화

`npm run build` (`scripts/build-dist.js`)가 하는 일:

1. 런타임 파일을 `src/` 구조 그대로 `dist/` 에 복사
2. 모든 런타임 파일 내용으로 **빌드 해시(8자)** 계산
3. `dist/sw.js` 의 `CACHE_NAME` 을 `hearttune-cache-<해시>` 로 자동 교체 → **배포할 때마다 캐시 자동 무효화**
4. `dist/index.html` 에 `<meta name="hearttune-build" content="<해시>">` 삽입
5. **모든 텍스트 자산(JS/CSS/sw.js)에 `/* hearttune-build: <해시> */` 주석, `manifest.webmanifest`에 `_build` 필드로 동일 해시 주입** → 운영 스모크가 **내용(Content) 기반**으로 신/구버전을 판별하는 지속 체계(시간/`Last-Modified` 미의존)
6. 절대경로(`/...`) 사용 금지 + **index.html 이 참조하는 자산이 dist 에 있는지** 검사
7. `.nojekyll` 생성

> **더 이상 `sw.js` 캐시 버전을 사람이 올릴 필요가 없습니다.**
> Service Worker 는 문서(HTML)를 네트워크 우선으로 가져오므로, 새 배포가 즉시 반영되고 오프라인일 때만 캐시를 사용합니다.

빌드 로그 예:
```
[build-dist] 성공: 21개 파일 · 참조 자산 7개 검증 · 빌드 62f060c9 · 캐시 hearttune-cache-62f060c9
```

---

## 6. 소스 구조

```
index.html                 ← 마크업만 (약 560줄)
src/
  main.css                 ← 스타일 전체
  main.js                  ← UI/네비게이션/측정 오케스트레이션
  dsp.js                   ← 신호처리 (DOM 비의존, 단위 테스트 대상)
  i18n.js                  ← ko/en 사전 + 키 일치 검증
  features/
    camera.js              ← 카메라 스트림·토치·장치 목록
    storage.js             ← 측정 이력·캘리브레이션 localStorage
    share.js               ← 결과 이미지 생성 및 공유/다운로드
    detail-view.js         ← 결과 상세·이력 상세·공유 이미지 단일 뷰모델
    result-indicators.js   ← 결과 지표 플래그·신호 품질 경계
tests/
  dsp.test.js              ← Node DSP 단위·회귀 18개
  detail-view.test.js      ← 상세 뷰모델 단위
  result-indicators.test.js ← 지표 플래그·문구 매핑 단위
  e2e/hearttune.spec.js    ← Playwright E2E 18개
scripts/
  build-dist.js            ← dist 빌드 + 버전 자동화
  serve.js                 ← 의존성 없는 정적 서버 (로컬/E2E)
sw.js, manifest.webmanifest
```

| 규칙 | 내용 |
| :--- | :--- |
| DOM 접근 | `main.js`/`features/*` 에서만. `dsp.js`·`i18n.js` 는 순수 로직 |
| 새 파일 추가 시 | `sw.js` 의 `ASSETS` **와** `scripts/build-dist.js` 의 `RUNTIME_FILES` 에 반드시 추가 |
| 화면 문구 | 코드에 하드코딩 금지 → `src/i18n.js` 키 사용 |
| 이벤트 | `click` 단일화(마우스·터치 동시 지원), `mousedown`/`touchstart` 금지 |

---

## 7. 검증 항목과 실행 명령

`verify.yml` 이 실행하는 것과 동일합니다.

| 검증 | 명령 | 내용 |
| :--- | :--- | :--- |
| 구문·모듈 lint | `npm run lint` | 모든 JS/ESM 모듈 구문 검사 |
| i18n 키 일치 | `npm run test:i18n` | ko/en 키 집합 100% 일치 (132키) |
| 단위·회귀 | `npm run test:unit` | 24개 — BPM 정확도, 하모닉 혼동, 박동 검출, 리듬(안정화·아티팩트 방어), 적응형 캘리브레이션, 상세 뷰모델, 지표 매핑 |
| E2E | `npm run test:e2e` | 18개 — 렌더링/아이콘·매니페스트/3영역 기하/측정 플로우/이력 스와이프 삭제·취소(터치 포함)/시트 드래그 닫기/설정 저장/법적 고지/뒤로가기 종료/디버그 샌드박스 |
| 산출물 빌드 | `npm run build` | dist 생성 + 경로/자산 검증 + 캐시 버전 자동화 |

로컬에서 화면을 보고 싶을 때(카메라 테스트 포함):

```bash
npm run serve          # http://localhost:8080
```

> E2E는 의존성 없는 `scripts/serve.js` 를 사용하므로 **추가 패키지 다운로드가 없습니다**.
> (`npx --yes serve` 로 매 실행마다 패키지를 받던 동작을 제거)

---

## 8. 문제 해결

| 증상 | 원인 / 조치 |
| :--- | :--- |
| ① Dev CI 의 DSP 단위테스트 실패 | 로그의 `기대 … 실측 …` 비교. `npm run test:unit` 로 로컬 재현 가능 |
| E2E 실패 | PR 이면 실패 로그가 **PR 코멘트**로 자동 게시됨. 로컬 재현: `npm run test:e2e` |
| `개발 미리보기 배포` 실패 | Settings → Pages → Source 가 **GitHub Actions** 인지 확인 |
| ② Promote ⓪ 에서 중단 | `confirm` 에 `PROMOTE` 를 정확히 입력 |
| ② Promote ① 실패 | 개발 CI와 동일한 검증 실패. 먼저 ①을 초록으로 |
| ② Promote ② 실패 | `ACTIONS_DEPLOY_PAT` 미등록/만료/권한 부족 |
| ② Promote ③ 실패 | 운영 Pages 빌드 지연(수 분) 또는 Pages 설정 오류 → **로그의 "현재 서빙 빌드 / README 감지" 확인 후 Summary 안내대로 Re-run failed jobs** (8-1절). 이관 ②는 이미 성공했을 수 있습니다. |
| 운영 화면이 예전 그대로 | 서비스 워커 캐시. 새로고침 2회 또는 시크릿 창. (캐시 이름은 빌드마다 자동 변경됨) |

---

## 8-1. 운영 스모크(이관 ③) 안정화 — 왜 이렇게 바꿨는가 (2026-10-19)

> 첫 Promote 성공 후 발견된 ③ 단계의 불안정(flaky) 원인을 제거하기 위한 개선. 근거는 첫 이관 로그(Re-run 1회로 성공)와 GitHub Pages 브랜치 배포의 전파 지연 특성.

### 왜 바꿨는가

| 기존(문제) | 개선(해결) |
|---|---|
| 판정 기준이 `오늘심박` 문자열 → 이전 빌드도 같은 문구를 포함하므로 **새 빌드 반영 여부를 구분할 수 없음** | **판정 기준을 `dist/index.html`의 `<meta name="hearttune-build" content="해시">`로 변경**. 기대 해시는 빌드 산출물에서 추출하고, 운영 응답에 같은 해시가 나타날 때만 성공으로 본다. |
| 최대 5분(30회×10초) 폴링 → Pages 브랜치 배포는 push 후 **수 분 지연**될 수 있어 타임아웃 | **최대 10분 폴링(60회×10초), 잡 `timeout-minutes: 20`** 으로 연장. 매 시도마다 "현재 서빙 중인 빌드 해시"를 로그에 출력해 진행 상황을 알 수 있다. |
| 실패 시 "무엇이 서빙 중인지" 알 수 없음 → 원인 파악 불가 | **실패 시 현재 서빙 중인 빌드 해시와 페이지 크기/헤드를 로그에 출력**. `README` 문자열이 감지되면 "Pages가 아직 README를 서빙 중"임을 명시 — 운영 저장소 push는 됐지만 Pages 빌드가 끝나지 않은 상태. |
| 자산 검증 4종 한 번 체크 → CDN/Pages 전파 지연으로 **일시 404가 실패로 처리** | **자산 12종 전부 검증 + 각각 최대 1분 재시도(6회×10초)**. 대상: `src/main.css`, `src/main.js`, `src/dsp.js`, `src/i18n.js`, `src/features/` 6종(camera·detail-view·result-indicators·sheets·storage·share), `sw.js`, `manifest.webmanifest`. |
| 파일명은 같지만 **내용이 다른 구버전**이 캐시/지연으로 서빙될 수 있음(시간/`Last-Modified`로는 구분 불가) | **빌드 시 모든 자산에 동일 해시 주입(JS/CSS/sw.js는 `/* hearttune-build: 해시 */`, manifest는 `_build` 필드, index.html은 meta, sw.js는 CACHE_NAME)** → 스모크가 각 파일 내용에 기대 해시가 포함됐는지로 판별. 함수명 같은 1회용 마커가 아니라 매 빌드 해시로 지속 가능. |
| ③ 실패 시 "이관 전체가 실패한 것처럼" 보여 사용자 혼란 → 운영 저장소 커밋은 이미 된 상태 | **실패 시 Summary에 안내 추가**: "이관 ②(운영 저장소 반영)는 이미 완료됐을 수 있음 — HeartTune 커밋 이력 확인 → Pages 지연이면 **Actions → 해당 실행 → Re-run failed jobs**로 ③만 재실행". 전체 워크플로를 다시 돌릴 필요가 없다. |

### 동작 요약

```
기대 해시 = dist/index.html 의 hearttune-build (예: 91282438)
# 빌드 시 모든 자산에 동일 해시가 이미 주입되어 있음:
#  - index.html: <meta name="hearttune-build" content="해시">
#  - src/*.js, src/*.css, sw.js: /* hearttune-build: 해시 */ (sw.js는 CACHE_NAME도 hearttune-cache-해시)
#  - manifest.webmanifest: { "_build": "해시", ... }

for 1..60 (10초 간격, 10분):
  운영 URL?deploy-check=... 을 no-cache로 GET
  응답에 <meta name="hearttune-build" content="기대 해시"> 가 있으면 성공
  없으면 현재 서빙 해시/README 여부를 로그에 남기고 대기
→ 실패 시 현재 서빙 빌드/README/페이지 헤드를 에러 로그로 출력

자산 12종 각각 (src/main.css, src/main.js, src/dsp.js, src/i18n.js, src/features/*.js 6종, sw.js, manifest.webmanifest):
  for 1..6 (10초 간격, 1분):
    PROD_URL + asset 을 no-cache로 GET
    → HTTP 200 이고 응답 본문에 기대 해시(91282438)가 포함되면 통과
    → 200이지만 해시가 없으면 구버전 캐시로 간주해 재시도
  6회 모두 실패하면 잡 실패
# → 파일 시간(Last-Modified)이나 1회용 심볼에 의존하지 않는 내용 기반 지속 체계
```

### 운영자가 해야 할 일

- ③이 실패하면 **먼저 HeartTune 저장소 Commits 확인**: `release: ... from HeartTune-test (...)` 커밋이 생겼다면 이관 ②는 성공한 것이다.
- 그 경우 **Re-run failed jobs**만 실행하면 된다(전체 재실행 불필요). Pages가 전파를 마치면 1~2분 내 성공한다.
- 반대로 운영 저장소에 커밋이 없다면 ② 자체가 실패한 것이므로 전체 워크플로를 다시 실행한다.

---

## 9. 현재 상태 (2026-10-24)

- ✅ 단위·회귀 테스트 **24/24 통과** (dsp 18 + 상세 뷰모델·지표 6)
- ✅ Playwright E2E **18/18 통과** (터치 스와이프·뒤로가기 종료 등 포함)
- ✅ i18n **132키** ko/en 일치
- ✅ 빌드·경로 검증 통과, Service Worker 캐시 버전 자동화 (최신 빌드 `62f060c9`, dist 21파일 — 아이콘 5종 포함)
- ✅ **개발/운영 분리 — ② Promote 첫 이관 성공(2026-10-19, Re-run 1회)**, 운영: https://zzexxous-pixel.github.io/HeartTune/
- ✅ **이관 ③ 스모크 로직 개선 (2026-10-19, 지속 체계)** — 빌드 해시 판정 / 10분 폴링 + 진단 로그 / **자산 12종**(2026-10-24 detail-view.js 추가) 각각 1분 재시도 + 내용 해시 판별 / Summary Re-run 안내 / timeout 20분 (8-1절)
- ✅ **실측 검증 1차 수행 (2026-10-24)** — 사용자 제공 원시 PPG CSV로 부정맥 오탐 재현·수정(카메라 3초 워밍업 + IBI MAD 정제, `docs/30-algorithm-dsp.md` 2-2절). 추가 실측 데이터 수집 지속 필요
- ✅ PR #6 (Stitch 리디자인 + 사용자 피드백 9차) 사용자 승인으로 병합 (2026-10-24)
- ⚠️ 운영 반영은 별도 실행: **② Promote to Production** 수동 실행 필요 (4절)
