# 오늘심박 · HeartTune

손가락을 휴대폰 후면 카메라에 대고 **심박수와 맥박 리듬**을 확인하는 1페이지 웹앱입니다.

- **스토어 제목 (KR)**: `오늘심박 - 심박수 측정기`
- **스토어 제목 (EN)**: `HeartTune - Heart Rate Monitor`
- 대상: 휴대폰 전용 · 한국어/영어 우선(i18n 구조) · PWA 지원
- 모든 처리는 브라우저 안에서만 수행 — 서버 전송 없음

> ⚠️ 본 앱은 의료기기가 아니며, 측정 결과는 참고용 정보입니다. 의학적 진단을 대체할 수 없습니다.

## 저장소 구조

| 저장소 | 역할 |
|---|---|
| `HeartTune-test` | 개발·테스트 (이 저장소, public — GitHub Pages 테스트용) |
| `HeartTune` | 운영. GitHub Actions로 test → 운영 자동 반영 예정 |

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/00-brand-concept.md`](docs/00-brand-concept.md) | 네이밍·상표·브랜드 톤 (결정 기록) |
| [`docs/10-spec.md`](docs/10-spec.md) | 기능 명세와 결정 사항 (측정 로직, 판정 기준, UI 원칙) |
| [`docs/20-architecture.md`](docs/20-architecture.md) | 기술 스택, 배포, i18n, PWA, 크로스 디바이스 이슈 |
| [`docs/30-algorithm-dsp.md`](docs/30-algorithm-dsp.md) | 신호처리 알고리즘 설계와 검증 결과 |

## 실행

```bash
npm start          # python3 -m http.server 8080 --bind 0.0.0.0
```

> ⚠️ 카메라(`getUserMedia`)는 **HTTPS**에서만 동작합니다.
> 로컬에서는 `http://localhost`만 허용되며, 원격 테스트는 HTTPS 호스트(이 저장소의 GitHub Pages 등)에서 해야 합니다.

## 테스트

```bash
npm test           # node --test tests/  — DSP 회귀 테스트 20개
```

## 코드 구조

```
index.html            1페이지 SPA (시작 → 측정 → 결과 / 기록 탭)
styles.css            모바일 우선 반응형
manifest.webmanifest  PWA
sw.js                 오프라인 캐시 (GitHub Pages 하위 경로 대응)
src/
  main.js             진입점 — 측정 흐름(15초부터 5초마다 실시간 BPM, 종료 후 리듬 판정)
  camera.js           getUserMedia + torch 폴백 + 프레임 수집 + 재표본화
  dsp.js              필터/FFT/박동검출/리듬분석 (순수 함수, node에서 테스트 가능)
  storage.js          localStorage 이력
  share.js            결과 이미지 생성 (Web Share / 다운로드 폴백)
  i18n/               ko.json · en.json · 로더 (키 3단 구조)
tests/
  dsp.test.js         합성 PPG 신호 회귀 테스트
```
