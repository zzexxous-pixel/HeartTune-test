# 40 · 배포, CI/CD 및 저장소 운영 가이드

> 오늘심박 (HeartTune) — 개발 검증과 운영 이관을 **분리**한 워크플로 운영 문서.
> 최종 업데이트: 2026-10-19

---

## 0. 한눈에 보는 구조

```
 [개발] HeartTune-test (main)
    │  github.dev(. 키) 또는 웹에서 커밋
    ▼
 ① Dev CI (HeartTune-test)                    ← ci.yml → verify.yml
    ├─ lint / i18n 키 일치 / DSP 단위·회귀(15) / Playwright E2E(5) / dist 빌드
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
| 이관 ③ 운영 배포 확인 | 운영 URL 200 + `오늘심박` 문구 + 자산 200 (최대 5분) | 실패 표시. 로그 확인 후 재실행 |

### 결과 확인

- **Actions 실행 화면** — 단계별 성공/실패
- **실행 Summary** — 결과·소스 커밋 SHA·운영 URL·운영 저장소 커밋 링크
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
5. 절대경로(`/...`) 사용 금지 + **index.html 이 참조하는 자산이 dist 에 있는지** 검사
6. `.nojekyll` 생성

> **더 이상 `sw.js` 캐시 버전을 사람이 올릴 필요가 없습니다.**
> Service Worker 는 문서(HTML)를 네트워크 우선으로 가져오므로, 새 배포가 즉시 반영되고 오프라인일 때만 캐시를 사용합니다.

빌드 로그 예:
```
[build-dist] 성공: 10개 파일 · 참조 자산 3개 검증 · 빌드 27cde79f · 캐시 hearttune-cache-27cde79f
```

---

## 6. 소스 구조

```
index.html                 ← 마크업만 (약 250줄)
src/
  main.css                 ← 스타일 전체
  main.js                  ← UI/네비게이션/측정 오케스트레이션
  dsp.js                   ← 신호처리 (DOM 비의존, 단위 테스트 대상)
  i18n.js                  ← ko/en 사전 + 키 일치 검증
  features/
    camera.js              ← 카메라 스트림·토치·장치 목록
    storage.js             ← 측정 이력·캘리브레이션 localStorage
    share.js               ← 결과 이미지 생성 및 공유/다운로드
tests/
  dsp.test.js              ← Node 단위·회귀 테스트 15개
  e2e/hearttune.spec.js    ← Playwright E2E 5개
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
| i18n 키 일치 | `npm run test:i18n` | ko/en 키 집합 100% 일치 (62키) |
| DSP 단위·회귀 | `npm run test:unit` | 15개 — BPM 정확도, 하모닉 혼동, 박동 검출, 리듬, 적응형 캘리브레이션 |
| E2E | `npm run test:e2e` | 5개 — 렌더링/법적 고지/언어 전환/조명/측정 플로우/디버그 샌드박스 |
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
| ② Promote ③ 실패 | 운영 Pages 빌드 지연 또는 Pages 설정 오류 → 재실행 |
| 운영 화면이 예전 그대로 | 서비스 워커 캐시. 새로고침 2회 또는 시크릿 창. (캐시 이름은 빌드마다 자동 변경됨) |

---

## 9. 현재 상태 (2026-10-19)

- ✅ DSP 단위·회귀 테스트 **15/15 통과**
- ✅ Playwright E2E **5/5 통과**
- ✅ 빌드·경로 검증 통과, Service Worker 캐시 버전 자동화
- ⚠️ **개발 저장소 Pages Source 를 `GitHub Actions` 로 변경해야** 미리보기 게이트가 동작합니다 (2-1)
- ⚠️ 실측(실제 카메라) 신호 검증은 아직 합성 신호 수준입니다 — 디버그 콘솔 CSV 로 실측 튜닝 필요
