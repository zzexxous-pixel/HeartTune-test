# 40 · 배포, CI/CD 및 저장소 운영 가이드

> 오늘심박 (HeartTune) — 개발 저장소 관리, .gitignore 설정, 그리고 GitHub Actions 자동 배포 파이프라인 가이드.
> 최종 업데이트: 2026-10-17

---

## 1. 디렉토리 구조 및 Git 관리 원칙

개발 저장소(`HeartTune-test`)에서 형상 관리(Git)에 포함되어야 할 파일과 제외되어야 할 파일(임시 빌드, 백업, 의존성 폴더 등)의 기준입니다.

| 경로 | 관리 여부 | 설명 |
| :--- | :---: | :--- |
| `index.html`, `manifest.webmanifest`, `sw.js`, `src/` | **추적 (Commit)** | 실제 웹앱 구동을 위한 핵심 런타임 파일 |
| `.github/workflows/ci-cd.yml` | **추적 (Commit)** | CI 테스트 검증 및 운영 자동 배포 워크플로[cite: 3, 5] |
| `package.json`, `playwright.config.js`, `scripts/`, `tests/` | **추적 (Commit)** | 빌드 스크립트, 단위 및 E2E 테스트 스위트 |
| `docs/` (`00~30` 기획 문서) | **추적 (Commit)** | 프로젝트 명세 및 아키텍처 히스토리 보관[cite: 1, 2, 3, 4] |
| `dist/`, `old/`, `node_modules/`, `playwright-report/` | **제외 (.gitignore)** | 빌드 산출물, 구버전 백업, 패키지 의존성, 테스트 리포트 |

---

## 2. `.gitignore` 설정

루트 경로에 `.gitignore` 파일을 생성하여 불필요한 파일과 폴더의 Git 추적을 차단합니다.

```gitignore
# 빌드 산출물 및 임시 백업 폴더 제외
dist/
old/

# Node.js 패키지 의존성 제외
node_modules/

# Playwright E2E 테스트 결과물 및 캐시 제외
playwright-report/
test-results/
blob-report/
playwright/.cache/

# 디버그 샌드박스 실측 CSV 데이터 제외
*.csv

# OS 및 에디터 임시 파일 제외
.DS_Store
Thumbs.db

```

---

## 3. GitHub Secrets 및 저장소 연동 가이드 (웹 UI 기준)

로컬 터미널 없이 GitHub 웹사이트에서 개발 저장소(`HeartTune-test`)와 운영 저장소(`HeartTune`)를 연동하여 자동 배포를 구성하는 절차입니다.

### 3-1. 운영 저장소 쓰기 권한 PAT(Personal Access Token) 발급

1. GitHub 우측 상단 **Profile Icon → Settings → Developer Settings → Personal access tokens → Fine-grained tokens**로 이동합니다.
2. **Generate new token**을 클릭합니다.
3. 설정 내용:
* **Token name**: `HeartTune-Deploy-Token`
* **Repository access**: **Only select repositories** 선택 후 배포 대상인 **`HeartTune`** 지정
* **Repository permissions**:
* **Contents**: `Read and write`
* **Pages**: `Read and write`




4. **Generate token** 후 생성된 `github_pat_...` 토큰 값을 복사합니다.

### 3-2. 개발 저장소에 Secret 등록

1. **`HeartTune-test`** 저장소의 **Settings → Secrets and variables → Actions**로 이동합니다.


2. **New repository secret**을 클릭합니다.
* **Name**: `ACTIONS_DEPLOY_PAT`
* **Secret**: 복사한 PAT 문자열 붙여넣기


3. 저장합니다.

### 3-3. 운영 저장소 GitHub Pages 활성화

1. **`HeartTune`** (운영 저장소)의 **Settings → Pages**로 이동합니다.


2. **Build and deployment → Source**를 `Deploy from a branch`로 설정합니다.


3. Branch를 `main` / `/(root)`로 지정하고 **Save**합니다.



---

## 4. 로컬 및 CI 테스트 실행 명령어

루트 경로의 `package.json`에 정의된 스크립트를 통해 검증을 수행할 수 있습니다.

* **구문 및 모듈 린트 검사**: `npm run lint`
* **i18n 한·영 키 집합 일치 검증**: `npm run test:i18n`
* **DSP 알고리즘 단위 및 회귀 테스트**: `npm run test:unit`
* **Playwright E2E 테스트 수행**: `npm run test:e2e`
* **배포용 정적 산출물 빌드 (`dist/`)**: `npm run build`
