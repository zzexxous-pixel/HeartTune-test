# 40 · 배포, CI/CD 및 저장소 운영 가이드

> 오늘심박 (HeartTune) — 개발 검증과 운영 이관을 **분리**한 워크플로 운영 문서.
> 최종 업데이트: 2026-10-25 (이관 ③ 거짓 실패 분석·수정 — 8-2절)

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

## 1. 워크플로 4종

| 파일 | 이름(Actions 탭) | 트리거 | 역할 |
| :--- | :--- | :--- | :--- |
| `.github/workflows/ci.yml` | **① Dev CI (HeartTune-test)** | main push / main 대상 PR / 수동 | 검증 + **검증 통과 시 개발 미리보기 배포** |
| `.github/workflows/promote-to-production.yml` | **② Promote to Production (HeartTune)** | **수동(workflow_dispatch)만** | 검증 후 운영 저장소로 이관 |
| `.github/workflows/preview-pr.yml` | PR preview | PR 갱신 / 미병합 close | 검증 산출물을 `/preview/`에 배포, close 시 정리 |
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
| 이관 ③ 운영 배포 확인 | 운영 URL의 **기대 빌드 해시**(`<meta name="hearttune-build">`) + **배포 산출물에서 자동 열거한 모든 자산(현재 15종)의 내용에 동일 해시 포함 여부**로 신/구버전 판별(시간 의존 없음) — **최대 10분 폴링, 잡 타임아웃 20분** | 산출물 사전 점검에서 실패하면 **빌드 문제**(재실행 무의미, 8-2절) / 배포 대기 실패면 **Re-run failed jobs**로 ③만 재실행 (8-1절) |

### 결과 확인

- **Actions 실행 화면** — 단계별 성공/실패
- **실행 Summary** — 결과·소스 커밋 SHA·운영 URL·운영 저장소 커밋 링크. ③ 실패 시 **원인에 따라 안내가 갈립니다**: 빌드 산출물 문제면 "원인은 빌드 · Re-run 무효 · ②를 새로 실행", Pages 지연이면 "이관 ②는 이미 완료됐을 수 있음 + Re-run 안내" (8-2절).
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
5. **모든 텍스트 자산(JS/CSS/sw.js)에 `/* hearttune-build: <해시> */` 주석, 모든 `.webmanifest`에 `_build` 필드로 동일 해시 주입** → 운영 스모크가 **내용(Content) 기반**으로 신/구버전을 판별하는 지속 체계(시간/`Last-Modified` 미의존)
   - 주입 대상은 **`RUNTIME_FILES` 에서 확장자(`.js`/`.css`)로 자동 파생**한다. 별도 목록을 손으로 관리하지 않는다(과거 사고 원인, 8-2절).
   - 주입 후 **`dist/` 를 실제로 훑어** 빠진 파일이 없는지 자기검사하고, 있으면 **빌드를 실패**시킨다. 이 검사는 Dev CI 검증 ③(`npm run build`)에서 돌기 때문에 운영 이관 전에 막힌다.
6. 절대경로(`/...`) 사용 금지 + **index.html 이 참조하는 자산이 dist 에 있는지** 검사
7. `.nojekyll` 생성

> **더 이상 `sw.js` 캐시 버전을 사람이 올릴 필요가 없습니다.**
> Service Worker 는 문서(HTML)를 네트워크 우선으로 가져오므로, 새 배포가 즉시 반영되고 오프라인일 때만 캐시를 사용합니다.

> **빌드 해시의 입력에는 런타임 파일 + `scripts/build-dist.js` 자신이 포함됩니다.**
> 빌드 스크립트만 바뀌어 산출물 내용이 달라지는 경우에도 해시가 반드시 바뀌게 해서,
> "같은 해시인데 내용은 다른" 산출물이 생기지 않도록 합니다(2026-10-25 사고의 부작용, 8-2절).

빌드 로그 예:
```
[build-dist] 성공: 24개 파일 · 참조 자산 7개 검증 · 해시 주입 15개 + index.html/meta + manifest/_build · 빌드 <자동 해시> · 캐시 hearttune-cache-<자동 해시>
```

---

## 6. 소스 구조

```
index.html                 ← 마크업·환경 경로 초기화
src/
  main.css                 ← 스타일 전체
  main.js                  ← UI/네비게이션/측정 오케스트레이션
  dsp.js                   ← 신호처리 (DOM 비의존, 단위 테스트 대상)
  i18n.js                  ← ko/en 사전 + 키 일치 검증
  features/
    measurement-policy.js  ← 실시간 첫 분석 시점·표시 품질 게이트(최종 DSP와 분리)
    camera.js              ← 카메라 스트림·토치·전면/후면 선택
    storage.js             ← 측정 이력·캘리브레이션 localStorage
    share.js               ← 결과 이미지 생성 및 공유/다운로드
    detail-view.js         ← 결과 상세·이력 상세·공유 이미지 단일 뷰모델
    result-indicators.js   ← 결과 지표 플래그·신호 품질 경계
tests/
  dsp.test.js              ← Node DSP 단위·회귀 18개
  detail-view.test.js      ← 상세 뷰모델 단위
  result-indicators.test.js ← 지표 플래그·문구 매핑 단위
  measurement-policy.test.js ← 실시간 시점·표시 게이트
  share-brand.test.js     ← PNG 마크 기하·그라데이션
  environment.test.js     ← 환경 경로·설치 메타데이터 단위 4개
  e2e/hearttune.spec.js    ← Playwright E2E 20개
scripts/
  build-dist.js            ← dist 빌드 + 버전 자동화
  serve.js                 ← 의존성 없는 정적 서버 (로컬/E2E)
sw.js, manifest*.webmanifest
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
| i18n 키 일치 | `npm run test:i18n` | ko/en 키 집합 100% 일치 (127키) |
| 단위·회귀 | `npm run test:unit` | 33개 — 실시간 표시 정책·공유 마크·환경 경로·설치 메타데이터, BPM 정확도, 하모닉 혼동, 박동 검출, 리듬(안정화·아티팩트 방어), 적응형 캘리브레이션, 상세 뷰모델, 지표 매핑 |
| E2E | `npm run test:e2e` | 20개 — 렌더링/아이콘·매니페스트/3영역 기하/측정 플로우/이력 스와이프 삭제·취소(터치 포함)/시트 드래그 닫기/설정 저장/법적 고지/뒤로가기 종료/디버그 샌드박스 |
| 산출물 빌드 | `npm run build` | dist 생성 + 경로/자산 검증 + **해시 주입 누락 자기검사** + 캐시 버전 자동화 |

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
| ② Promote ③ 실패 — **`산출물 사전 점검` 에서 실패** | **빌드 문제이지 운영 문제가 아니다.** 로그에 지목된 파일에 빌드 해시가 주입되지 않았다는 뜻 → `scripts/build-dist.js` 를 고치고 **새로 ②를 실행**한다. **Re-run failed jobs 로는 절대 해결되지 않는다**(같은 산출물을 다시 내려받기 때문). (8-2절) |
| ② Promote ③ 실패 — 배포 대기/자산 재시도 소진 | 운영 Pages 빌드 지연(수 분) 또는 Pages 설정 오류 → **로그의 "현재 서빙 빌드 / README 감지" 확인 후 Summary 안내대로 Re-run failed jobs** (8-1절). 이관 ②는 이미 성공했을 수 있습니다. |
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
| 자산 검증 4종 한 번 체크 → CDN/Pages 전파 지연으로 **일시 404가 실패로 처리** | **산출물의 모든 텍스트 자산(현재 15종) 검증 + 각각 최대 1분 재시도(6회×10초)**. 대상은 워크플로에 하드코딩하지 않고 **배포되는 `dist/` 에서 자동 열거**한다(`*.js`·`*.css`·`*.webmanifest`). 2026-10-25 이전에는 12종을 손으로 나열했고, 그 목록과 빌드 주입 목록이 어긋나 사고가 났다(8-2절). |
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

자산 목록 = dist/ 에서 자동 열거 (현재 15종: *.js 11 + main.css + 매니페스트 3종)
사전 점검(pre-flight): 각 자산의 **dist/ 내용**에 기대 해시가 없으면 즉시 실패
  → "운영이 아니라 빌드 문제" 로 명확히 알리고, 6회 재시도(=1분)를 낭비하지 않는다
각 자산:
  for 1..6 (10초 간격, 1분):
    PROD_URL + asset 을 no-cache로 GET
    → HTTP 200 이고 응답 본문에 기대 해시(91282438)가 포함되면 통과
    → 200이지만 해시가 없으면 구버전 캐시로 간주해 재시도
  6회 모두 실패하면 잡 실패
# → 파일 시간(Last-Modified)이나 1회용 심볼에 의존하지 않는 내용 기반 지속 체계
```

### 운영자가 해야 할 일

③이 실패하면 **어느 단계에서 실패했는지부터** 본다.

| 실패 지점 | 의미 | 조치 |
| :--- | :--- | :--- |
| `Verify runtime assets` 의 **사전 점검** (`빌드 산출물 … 에 빌드 해시가 없습니다`) | 빌드가 원인. **재실행해도 항상 실패** | `scripts/build-dist.js` 수정 → 새로 ② Promote 실행 |
| `Verify runtime assets` 의 **재시도 소진** (`60초 내 기대 빌드를 서빙하지 않았습니다`) | Pages 전파 지연 | **Re-run failed jobs** (③만 재실행) |
| `Wait for production URL` | Pages 전파 지연 / Pages 설정 오류 | HeartTune 저장소 Commits 확인 → 커밋 있으면 **Re-run failed jobs**, 없으면 ② 실패이므로 전체 재실행 |

- ③이 실패하면 **먼저 HeartTune 저장소 Commits 확인**: `release: ... from HeartTune-test (...)` 커밋이 생겼다면 이관 ②는 성공한 것이다.
- 그 경우 **Re-run failed jobs**만 실행하면 된다(전체 재실행 불필요). Pages가 전파를 마치면 1~2분 내 성공한다.
- 반대로 운영 저장소에 커밋이 없다면 ② 자체가 실패한 것이므로 전체 워크플로를 다시 실행한다.

---

## 8-2. 2026-10-25 운영 이관 ③ 실패 — 원인과 재발 방지

### 증상

- `② Promote to Production (HeartTune)` 실행([run 40172601954](https://github.com/zzexxous-pixel/HeartTune-test/actions/runs/40172601954))이 **이관 ③에서만** 실패(⓪·①·② 모두 성공, 2분 47초).
- 실패 메시지: `src/features/detail-view.js 자산이 60초 내 기대 빌드(62f060c9)를 서빙하지 않았습니다. (200이어도 내용이 구버전이면 실패)`
- 실제로는 **운영이 정상 배포된 상태**였다 — 운영 저장소 `main` 에 release 커밋(`d2284ff`)이 있었고, 운영 `index.html` 은 기대 해시 `62f060c9` 를 서빙 중이었으며, `src/features/detail-view.js` 도 200으로 정상 응답했다.

### 원인 (거짓 실패, false negative)

같은 "런타임 자산" 목록이 **세 곳**에 따로 존재했고, 그중 하나만 갱신되지 않았다.

| 목록 | 위치 | detail-view.js |
| :--- | :--- | :--- |
| 오프라인 캐시 | `sw.js` `ASSETS` | ✅ 있음 |
| 배포 복사 | `scripts/build-dist.js` `RUNTIME_FILES` | ✅ 있음 |
| **해시 주입** | `scripts/build-dist.js` `textAssets` | ❌ **없음** |
| 운영 스모크 | `promote-to-production.yml` `assets` | ✅ 있음 (2026-10-24 문서 정비 때 추가) |

즉 `detail-view.js` 는 배포는 되지만 **빌드 해시 주석이 주입되지 않았다**. 그런데 2026-10-24 에 운영 스모크 자산 목록에 이 파일을 추가하면서 "모든 자산은 빌드 해시를 포함한다"는 전제로 검사하게 되어, **구조적으로 절대 통과할 수 없는 검사**가 만들어졌다. Pages 전파 지연이 아니라 빌드 산출물의 결함이었으므로 재실행으로는 해결되지 않았다.

부수 문제: 빌드 해시가 **런타임 파일 내용**만으로 계산되어, `build-dist.js` 만 바뀌면 "해시는 같고 내용은 다른" 산출물이 생긴다. 이 사고에서도 운영이 서빙하던 `62f060c9` 와 수정 후 산출물의 해시가 같아져, 이관 ③이 신/구버전을 구분할 수 없는 상태였다.

### 해결 (커밋 · PR 참조)

| 변경 | 내용 |
| :--- | :--- |
| `scripts/build-dist.js` — 주입 목록 자동 파생 | `textAssets` 하드코딩 제거. `RUNTIME_FILES` 에서 `.js`/`.css` 를 자동 선택 → **새 파일을 추가하면 주입도 자동**으로 따라온다. |
| `scripts/build-dist.js` — 자기검사 추가 | 주입 후 **`dist/` 를 실제로 훑어** 해시가 없는 텍스트 자산이 있으면 빌드 실패. 목록이 아니라 산출물을 기준으로 검사하므로 "주입 목록에서 빠진 파일"도 잡힌다. → Dev CI 검증 ③(`npm run build`)에서 운영 이관 **전에** 차단. |
| `scripts/build-dist.js` — manifest 주입 실패는 경고가 아니라 오류 | 조용히 넘어가면 이번과 같은 거짓 실패가 운영에서 터진다. |
| `scripts/build-dist.js` — 빌드 해시 입력에 자기 자신 추가 | 스크립트만 바뀌어도 해시가 바뀌어 "같은 해시 · 다른 내용"이 생기지 않는다. |
| `promote-to-production.yml` — 자산 목록 자동 열거 | 하드코딩된 12종 배열 삭제. 배포되는 `dist/` 에서 `*.js`·`*.css`·`manifest.webmanifest` 를 열거 → **네 번째 목록 자체를 없앰**. |
| `promote-to-production.yml` — 사전 점검(pre-flight) | 원격 확인 **전에** 산출물에 해시가 있는지 검사. 없으면 1분 재시도 없이 즉시 "운영이 아니라 빌드 문제"로 실패해, 잘못된 "Pages 지연" 진단을 막는다. |
| `promote-to-production.yml` — Summary 원인 분기 | `SMOKE_FAILURE_KIND`(build/deploy)로 안내 문구를 나눈다. 빌드 문제일 때 "Re-run failed jobs 는 효과 없음(같은 아티팩트를 다시 받음) → 코드 수정 후 ② 새로 실행"을 명시. |

### 검증

- 로컬에서 원래 버그를 재현(주입 목록에서 `detail-view.js` 제외) → `npm run build` 가 `빌드 해시(...)가 주입되지 않은 텍스트 자산: src/features/detail-view.js` 로 **exit 1**.
- 정상 빌드 → 해시 주입 12개(코드 11 + manifest) + `index.html` meta, 2회 빌드 해시 동일(재현성).
- 이관 ③ 자산 단계를 추출해 로컬 `dist/` 를 서버로 띄우고 실행 → 12종 전부 통과(exit 0).
- 같은 스크립트를 "detail-view.js 해시만 제거한 산출물"에 실행 → **0.04초** 만에 사전 점검 실패(exit 1)와 정확한 안내 문구 출력.
- Summary 분기(`SMOKE_FAILURE_KIND=build` / `deploy`) 스크립트를 로컬에서 렌더링해 문구 확인.

### 당시 운영자 조치 (과거 사고 기록; 현재 실행 대기 아님)

이미 운영에는 정상 빌드가 올라가 있으므로 **서비스 영향은 없었다**. 다만 ③이 빨간색으로 남아 있으므로:

1. 이 수정이 `main` 에 병합된 뒤 **② Promote to Production 을 새로 실행**한다(빌드 해시가 `f5fa663d` 로 바뀌어 ③이 정상 통과한다).
2. **실패했던 실행의 `Re-run failed jobs` 는 쓰지 않는다.** 그 실행의 산출물 아티팩트를 그대로 다시 내려받기 때문에 또 실패한다.

---

## 9. 확인 상태 (2026-10-26)

- 사용자가 기존 앱의 E2E·실기기 카메라·운영 배포 확인 완료를 알렸다. 임상 검증을 뜻하지 않는다.
- PR #8의 코드 커밋 `b0c341d`에 대한 검증·E2E·PR 미리보기 배포가 성공했다(run 40427347109). 이후 커밋은 해당 실행 상태로 확인한다. 환경 표식·설치 이름의 실기기 설치 확인은 별도 필요하다.
- 최신 운영 해시·CI 실행 상태는 이 문서에 추정 기록하지 않고 해당 산출물·Actions에서 확인한다.
- 현재 로컬 검증 결과는 `agent.md`에 기록한다.

## 10. 개발·프리뷰 환경 식별 (2026-10-26)

동일한 검증 산출물을 배포하며 `index.html`의 초기화 스크립트가 접속 경로를 구분한다.

| 접속 경로 | 화면 제목 뒤 | 설치 이름(name·short_name·Apple 메타) | 매니페스트 |
|---|---|---|---|
| `/HeartTune-test/` 및 그 아래 일반 경로 | 파란색 `dev` | `하루심박 dev` | `./manifest-dev.webmanifest` |
| `/HeartTune-test/preview/` 및 그 아래 | 보라색 `pre` | `하루심박 pre` | `./manifest-pre.webmanifest` |
| `/HeartTune/`, 그 밖의 경로 | 표식 없음(기존 제목) | 기존 운영 이름 유지 | `./manifest.webmanifest` |

- `index.html` 직접 접속과 언어 전환에서도 표식을 유지한다. 브라우저 탭 제목에는 같은 접미사를 붙인다.
- 요청에 따라 비운영 설치 이름만 **하루심박**을 사용하며, 기존 화면 번역·공유 PNG·운영 이름 **오늘심박/HeartTune**은 바꾸지 않는다.
- 매니페스트는 실제 정적 파일이다. 각 파일의 상대 `start_url`·`scope`가 설치한 경로를 가리키므로 dev/pre/운영의 시작 URL·기본 앱 식별이 분리된다.
- 두 새 매니페스트를 `RUNTIME_FILES`·SW `ASSETS`에 등록한다. 모든 `.webmanifest`에 해시 주입·자기검사·운영 스모크를 적용한다.
- 매니페스트 선택은 head에서 수행한다. 설치 이름은 OS·브라우저 정책 및 사용자의 이름 변경에 영향을 받으며, 이미 설치한 앱 이름은 즉시 갱신되지 않을 수 있다. 새 이름 확인은 재설치가 필요할 수 있다.
- 경로 구분은 브랜딩용이며 데이터 격리·보안 경계가 아니다. 같은 origin의 localStorage는 공유된다. 데이터 분리 변경은 이번 범위에 포함하지 않는다.

## 11. 병합 전 PR 소스 확인 방법

`/preview/`는 PR 브랜치의 검증 산출물을 실행하는 사이트다. 병합 전 소스도 이미 GitHub의 해당 브랜치에 존재하며 main에만 아직 합쳐지지 않은 상태다.

1. GitHub 저장소 → **Pull requests** → 해당 PR을 연다.
2. **Files changed**: main과 PR 사이의 수정·삭제·추가 내용을 diff로 확인한다. 파일 필터로 `src/main.js` 등을 찾는다. 표시가 생략되면 Load diff를 누른다.
3. **Commits**: 커밋 목록에서 원하는 커밋을 누르면 그 커밋의 변경을 확인한다. 전체 소스를 보려면 **Browse files**로 이동한다.
4. 저장소 **Code**에서 기본 `main` 브랜치 선택 버튼을 누르고 PR의 head 브랜치를 고르면 해당 브랜치 전체 파일을 볼 수 있다. 브랜치 이름에 `/`가 있어도 검색창에 전체 이름을 넣으면 된다.
5. 특정 버전을 고정해 검토하려면 브랜치가 아닌 **커밋 SHA**의 tree 링크를 사용한다. 브랜치 링크는 이후 푸시로 내용이 바뀐다.
6. 웹 편집기에서 읽으려면 브랜치를 선택한 상태에서 `.` 키를 누르거나 GitHub의 파일 보기에서 Open in github.dev를 사용한다. 읽기만으로 커밋이 생기지는 않는다.
7. **Code → Download ZIP**은 현재 선택한 브랜치/커밋 기준이다. 로컬에서 보려면 해당 브랜치를 clone/fetch하여 확인한다.
8. **Checks / Actions → PR 미리보기**의 배포 요약에서 PR 번호·커밋 SHA를 확인해 보고 있는 preview 버전과 대조한다. 검증은 PR merge ref로 실행될 수 있어 main과 결합된 검증 상태도 구분한다. `/preview/`는 공용 경로이므로 다른 PR이나 후속 푸시가 다시 배포하면 내용이 바뀔 수 있다.

GitHub 원본 소스와 배포 산출물은 구분한다. 원본은 PR 브랜치, 배포된 정확한 파일은 해당 성공 실행의 artifact와 빌드 해시로 확인한다. URL이 열린다는 이유만으로 최신 PR 배포라고 가정하지 않는다. 비공개 저장소는 접근 권한이 있는 GitHub 계정으로 로그인해야 한다.
