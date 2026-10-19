# 40 · 배포, CI/CD 및 저장소 운영 가이드

> 오늘심박 (HeartTune) — 개발 검증과 운영 이관을 **분리**한 워크플로 운영 문서.
> 최종 업데이트: 2026-10-19

---

## 0. 한눈에 보는 구조

```
 [개발] HeartTune-test (main)
    │  github.dev(. 키) 또는 웹에서 커밋
    ▼
 ① Dev CI (HeartTune-test)          ← ci.yml
    ├─ lint / i18n 키 일치 / DSP 단위·회귀 / Playwright E2E / dist 빌드
    └─ 운영에는 아무 것도 배포하지 않음
    │
    │  (main 브랜치 GitHub Pages 자동 배포 — 커밋 후 1~2분)
    ▼
 https://zzexxous-pixel.github.io/HeartTune-test/
    │  👀 화면 직접 확인 · 계속 수정 (몇 번을 반복해도 운영은 그대로)
    │
    │  ✅ "이 정도면 되겠다" 판단 → 사람이 직접 실행
    ▼
 ② Promote to Production (HeartTune)   ← promote-to-production.yml (수동 전용)
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
| 개발 커밋은 운영을 건드리지 않는다 | `ci.yml`은 테스트만 한다. 배포 스텝이 아예 없다. |
| 운영 반영은 100% 수동 | `promote-to-production.yml`은 `workflow_dispatch` **단독 트리거**. `push`/`tag`로는 실행 불가. |
| 검증 없이는 못 나간다 | 이관 워크플로가 **같은 검증을 다시 수행**하고, 통과한 산출물만 배포한다. |
| 두 검증은 같은 정의를 쓴다 | 공통 검증은 `verify.yml`(재사용 워크플로) 한 곳에만 존재한다. |

---

## 1. 워크플로 3종

| 파일 | 이름(Actions 탭) | 트리거 | 역할 |
| :--- | :--- | :--- | :--- |
| `.github/workflows/ci.yml` | **① Dev CI (HeartTune-test)** | main push / main 대상 PR / 수동 | 개발 커밋 검증만. 운영 배포 없음 |
| `.github/workflows/promote-to-production.yml` | **② Promote to Production (HeartTune)** | **수동(workflow_dispatch)만** | 검증 후 운영 저장소로 이관 |
| `.github/workflows/verify.yml` | Verify (reusable) | `workflow_call` (직접 실행 불가) | 위 둘이 공유하는 검증 정의 |

> 기존의 `ci-cd.yml`(CI + 태그 자동 배포가 한 덩어리)은 제거되었습니다.

---

## 2. 개발 사이클 (① Dev CI)

### 2-1. 개발 방법 — 로컬 없이 GitHub 에서

1. `HeartTune-test` 저장소에서 **`.`(마침표) 키** → `github.dev`(웹 VS Code) 실행
2. 파일 수정 → 좌측 Source Control 에서 커밋 → **`main` 에 푸시**
   - ⚠️ `github.dev`는 터미널이 없어 `npm test`를 직접 돌릴 수 없습니다. **테스트는 Actions가 대신 수행**합니다.
   - ⚠️ `github.dev`에서는 **태그 생성이 불가**합니다. 그래서 이 프로젝트는 태그 릴리스를 쓰지 않습니다.
3. **Actions → ① Dev CI (HeartTune-test)** 에서 결과 확인
   - `검증 ① lint · i18n · DSP 단위테스트`
   - `검증 ② Playwright E2E`
   - `검증 ③ 운영 산출물 빌드`
4. **개발 화면 확인**: https://zzexxous-pixel.github.io/HeartTune-test/
   - `main` 브랜치 Pages 자동 배포라 커밋 후 1~2분이면 반영됩니다.
   - 휴대폰에서 열어 실제 카메라 동작까지 확인하는 것을 권장합니다.
5. 마음에 들 때까지 2~4를 반복합니다. **이 단계에서 운영은 절대 바뀌지 않습니다.**

### 2-2. 브랜치를 따서 작업하는 경우

PR을 `main` 으로 올리면 `pull_request` 트리거로 동일한 검증이 돌아갑니다. PR 화면에서 체크 결과를 보고 머지하면 됩니다.

### 2-3. 개발 Pages까지 테스트 통과 후에만 갱신하고 싶다면 (선택)

현재 개발 Pages는 **브랜치 기반 배포**(Settings → Pages → `main` / `(root)`)라서, 테스트가 실패한 커밋도 화면에는 먼저 올라갑니다(개발 서버 성격).
이것을 막고 싶다면 Settings → Pages → Source 를 **GitHub Actions** 로 바꾸고 `ci.yml` 끝에 Pages 배포 잡을 추가하면 됩니다. (요청 시 추가 가능)

---

## 3. 운영 이관 절차 (② Promote to Production)

### 3-1. 실행 방법

1. GitHub → **Actions** 탭 → 좌측에서 **② Promote to Production (HeartTune)** 선택
2. 우측 **Run workflow** 클릭
3. 입력값
   - **Use workflow from**: `main`
   - **confirm**: `PROMOTE` (이 값을 틀리면 ⓪ 단계에서 즉시 중단됩니다)
   - **release_note** (선택): 운영 저장소 커밋 메시지. 비우면 자동 생성
4. **Run workflow** 실행

### 3-2. 실행되는 단계

| 단계 | 내용 | 실패 시 |
| :--- | :--- | :--- |
| 이관 ⓪ 확인 | `confirm == PROMOTE` 검사 | 아무 것도 배포되지 않음 |
| 이관 ① 소스 재검증 | 개발 CI와 **완전히 동일한** lint/i18n/DSP/E2E/빌드 | 운영 반영 중단 |
| 이관 ② 운영 저장소 반영 | `dist/` → `HeartTune`의 `main` 으로 push (PAT 사용) | 운영 반영 중단 |
| 이관 ③ 운영 배포 확인 | 운영 URL 200 응답 + `오늘심박` 문구 + `src/*.js`, `sw.js`, manifest 200 확인 (최대 5분 대기) | 실패로 표시(운영 파일은 이미 올라간 상태이므로 로그 확인 후 재실행) |

### 3-3. 결과 확인 위치

- **Actions 실행 화면** — 단계별 성공/실패
- **실행 Summary** — 결과·소스 커밋 SHA·운영 URL·운영 저장소 커밋 링크
- **HeartTune 저장소 → Commits** — `release: main from HeartTune-test (<sha>)` 커밋이 1건씩 쌓입니다(이력 보존).
- **운영 화면** — https://zzexxous-pixel.github.io/HeartTune/

> 운영 배포는 `production` environment 로 기록됩니다. 필요하면 Settings → Environments → `production` 에 **Required reviewers** 를 걸어 2차 승인 절차를 추가할 수 있습니다.

### 3-4. 롤백

운영 저장소 `HeartTune`는 배포 이력이 커밋으로 남습니다.
1. 운영 저장소 커밋 목록에서 **직전 정상 배포 커밋**을 확인
2. 해당 커밋 시점으로 되돌리는 방법
   - 간단: `HeartTune-test`의 `main`을 그 시점 상태로 되돌린 뒤 ②를 다시 실행
   - 또는 운영 저장소에서 `git revert` 후 push

> `force_orphan: false` 이므로 이력이 사라지지 않습니다. (과거 설정은 매 배포마다 이력을 지웠습니다)

---

## 4. 최초 1회 설정 (이미 되어 있다면 생략)

### 4-1. 운영 저장소 쓰기 권한 PAT

1. GitHub 우측 상단 **Profile → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. **Generate new token**
   - Token name: `HeartTune-Deploy-Token`
   - Repository access: **Only select repositories → `HeartTune`**
   - Permissions: **Contents: Read and write**, **Pages: Read and write**
3. 생성된 `github_pat_...` 복사

### 4-2. 개발 저장소에 Secret 등록

**`HeartTune-test` → Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
| :--- | :--- |
| `ACTIONS_DEPLOY_PAT` | 위에서 복사한 PAT |

> ⚠️ 이 Secret 이 없으면 ② 이관 워크플로의 **이관 ②** 단계에서 실패합니다.

### 4-3. 운영 저장소 GitHub Pages

**`HeartTune` → Settings → Pages**
- Source: **Deploy from a branch**
- Branch: **`main`** / **`/(root)`** → Save

---

## 5. Git 관리 원칙

| 경로 | 관리 여부 | 설명 |
| :--- | :---: | :--- |
| `index.html`, `manifest.webmanifest`, `sw.js`, `src/` | **추적** | 웹앱 런타임 |
| `.github/workflows/*.yml` | **추적** | CI/이관 워크플로 |
| `package.json`, `playwright.config.js`, `scripts/`, `tests/` | **추적** | 빌드·테스트 |
| `docs/` | **추적** | 기획·설계 문서 |
| `dist/`, `old/`, `node_modules/`, `playwright-report/` | **제외** | 빌드 산출물·백업·의존성·리포트 |

`.gitignore` 는 그대로 유지합니다.

```gitignore
dist/
old/
node_modules/
playwright-report/
test-results/
blob-report/
playwright/.cache/
*.csv
.DS_Store
Thumbs.db
```

> `old/` 는 과거 버전 소스입니다. 저장소에 남아 있으나 Git 추적은 제외되어 있습니다(원격에는 아직 존재).

---

## 6. 검증 항목과 실행 명령

`verify.yml` 이 실행하는 것과 동일한 명령입니다.

| 검증 | 명령 | 내용 |
| :--- | :--- | :--- |
| 구문·모듈 lint | `npm run lint` | `src/dsp.js`, `src/i18n.js`, `sw.js`, `tests/dsp.test.js` 구문 검사 |
| i18n 키 일치 | `npm run test:i18n` | ko/en 키 집합 100% 일치 |
| DSP 단위·회귀 | `npm run test:unit` | 합성 PPG 신호 BPM 정확도, 박동 검출, 리듬 판정, 적응형 캘리브레이션 |
| E2E | `npm run test:e2e` | Playwright — 렌더링/법적 고지/언어 전환/조명/측정 플로우 |
| 산출물 빌드 | `npm run build` | `dist/` 생성 + 절대경로(`/...`) 사용 금지 검사 |

빌드 산출물(`dist/`)은 다음 5개 파일 + `.nojekyll` 입니다.
`index.html`, `manifest.webmanifest`, `sw.js`, `src/dsp.js`, `src/i18n.js`

> 운영 저장소의 기존 `README.md` 는 첫 이관 시 `dist/` 내용으로 대체됩니다(의도된 동작).

---

## 7. 문제 해결

| 증상 | 원인 / 조치 |
| :--- | :--- |
| ① Dev CI 가 Step 3 에서 실패 | DSP 단위 테스트 실패. 로그의 `기대 … 실측 …` 값을 보고 알고리즘 또는 기대값을 조정 |
| ② Promote 가 ⓪ 에서 즉시 중단 | `confirm` 에 `PROMOTE` 를 정확히 입력 |
| ② Promote 의 ① 단계 실패 | 개발 CI와 동일한 검증이 실패한 것. 먼저 ① Dev CI 를 초록으로 만든 뒤 재실행 |
| ② Promote 의 ② 단계 실패 | `ACTIONS_DEPLOY_PAT` 미등록/만료/권한 부족. Secret 재등록 |
| ② Promote 의 ③ 단계 실패 | 운영 Pages 빌드 지연 또는 Pages 설정 오류. HeartTune → Settings → Pages 확인 후 워크플로 재실행 |
| 운영 화면이 안 바뀜 | 서비스 워커 캐시 때문일 수 있음. 새로고침/시크릿 창에서 확인 (캐시 이름 `hearttune-cache-v1` 은 `sw.js` 수정 시 올려야 함) |

---

## 8. 현재 알려진 미해결 사항 (2026-10-19 기준)

- **DSP 단위 테스트 3건 실패**: `55/90/130 BPM`, 강한 노이즈(seed 3), 45 BPM 중첩파 케이스.
  ① Dev CI 와 ② 이관 ① 단계가 모두 이 지점에서 막힙니다. (알고리즘 보정 필요)
- **E2E 는 아직 실제로 실행된 적 없음**: 위 단위 테스트에서 먼저 멈춰 Step 이 skip 되었습니다. 초록 전환 후 실제 동작 확인 필요.
- **`ACTIONS_DEPLOY_PAT` 등록 여부 미확인**: 토큰 권한상 Secret 목록 조회가 불가하여 확인하지 못했습니다.
- **Playwright `webServer`**: `playwright.config.js` 는 `npx --yes serve` 를 쓰지만 `package.json` 의존성은 `http-server` 입니다. 동작은 하지만 실행마다 패키지를 내려받으므로 정리 권장.
