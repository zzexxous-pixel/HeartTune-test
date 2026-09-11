# 오늘심박 (HeartTune) — 브랜드 컨셉 문서

> 상태: **네이밍 확정 · 컨셉 확정 완료 → 다음 단계: 화면 설계 / 코딩 미착수**
> 최종 업데이트: 2026-09-11

---

## 1. 확정된 사항

| 항목 | 결정 |
|---|---|
| 앱 이름 (한국어) | **오늘심박** |
| 스토어 제목 (KR) | **오늘심박 - 심박수 측정기** (14자 / 제한 30자) |
| 앱 이름 (영문) | **HeartTune** |
| 스토어 제목 (EN) | **HeartTune - Heart Rate Monitor** (30자 / 제한 30자 — **딱 맞음, 여유 없음**) |
| 상표 | "오늘심박" ✅ 안전 · **"HeartTune" ✅ 동일 상표 없음** (키프리스, 2026-09-11 사용자 확인) |
| 저장소 | **운영 `HeartTune`** / **개발 `HeartTune-test`** (GitHub Actions로 test → 운영 자동 반영) |
| 형태 | **1페이지 웹앱** (SPA, 화면 전환 없음) |
| 핵심 기능 | 카메라로 심박 측정 + 정상 / 부정맥 / 빈맥 등 간편 판정 |
| 측정 방식 | **손가락 PPG** (후면 카메라 + 플래시). 얼굴 rPPG는 **보류**(향후 검토) |
| 측정 시간 | **기본 30초** (옵션 15초 / 30초 / 60초) |
| 실시간 표시 | **15초 시점부터 5초마다** BPM 갱신 표시 (지루함 방지) |
| 부정맥 판정 | **지정한 측정 시간이 끝난 후** 전체 구간으로 판정 |
| 이력 저장 | ✅ **브라우저(localStorage)** 에 저장 |
| 결과 공유 | ✅ **이미지로 저장** |
| PWA | ✅ **지원** (홈 화면 설치) |
| 호스팅 | ✅ **GitHub Pages** |
| 대응 기기 | ✅ **PC / 태블릿 / 휴대폰 전부** — 반응형 웹앱 |
| 입력 방식 | ✅ **마우스 클릭 + 터치 모두** 지원 |
| 메인 타깃 | **중장년** (+ 가족이 부모님 확인). 스트레스 등 기능 확장 → **사용자 확장 보류** |
| 언어 | **한국어 / 영어 우선**, i18n 구조로 **다국어 확장 가능하게 설계** |

### 표기 규칙
- 영문은 반드시 **`HeartTune` 붙여쓰기** (H·T 대문자, 가운데 띄어쓰기·하이픈 없음). `Heart Tune`으로 띄어쓰면 일반 문구로 읽혀 상표 식별력이 떨어짐.
- 스토어 부제 `- 심박수 측정기` / `- Heart Rate Monitor` **유지**. (플레이스토어 상위 심박수 앱 11개 중 6개가 동일 문구 사용 = 실제 검색어)
- **설명란에 "맥박" 키워드 포함**. 경쟁사도 `Cardiio: 심박수 - 맥박측정기`처럼 검색어용으로 사용.
- 앱 이름·화면에 **"진단" 단어 사용 금지** (의료기기 규제 리스크). → "참고용 정보" 표현 사용.

---

## 2. 네이밍 근거 — 시장 조사 결과 (2026-09-11 실측)

### 구글 플레이 "심박수 측정기" 상위 11개 실제 제목
| 앱 ID | 스토어 제목 |
|---|---|
| com.welltory.client.android | 웰토리: 심박수및스트레스측정, 헬스케어, 심박수 측정기 |
| com.reflectio.io | Pulsebit: 심박수 측정기 |
| com.visionwizard.pulse | HeartIn: 심박수 측정기 |
| com.icardiac.heartratemonitor.healthapp | 심장 건강 모니터 - iCardiac |
| heart.rate.monitor.pulse | Cardi Mate: 심박수 측정기, 심전도 |
| si.modula.android.instantheartrate | Instant Heart Rate: HR Monitor |
| air.heart.rate | Heart Rate Monitor - Pulse PRO |
| com.bluefish.heartrate | 심박수 측정기 |
| heartrate.heartratemonitor… | 심박수: 심장 박동 측정기 |
| heartratemonitor.heartrate.pulse… | 심박수 측정기 - 펄스 |
| com.heartrate.bloodpressure.app | Heart Rate Monitor |

**시사점**
1. 시장 표준어는 **"맥박"이 아니라 "심박수"**. 애플 `심박수`, 삼성헬스, 상위 앱 전부 "심박수" 사용.
2. 11개 중 **6개가 그냥 "심박수 측정기"** — 무개성 레드오션. → 브랜드명 + 부제 구조로 차별화.

### "오늘심박" 선점 여부 (실측)
| 조회 | 결과 |
|---|---|
| App Store KR "오늘심박" | 결과 2개, 이름 포함 앱 **0개** |
| Play 스토어 "오늘심박" | 30개 모두 무관, 제목 포함 **0개** |
| GitHub | `onulsimbak` 404 → **사용 가능** |

> 영문명 선점 조사는 6절 참조. (초기 후보 `BeatDay` 조사 결과: App Store/Play/GitHub/도메인 모두 비어 있었으나 키프리스 상표 선점으로 배제)

> ⚠️ DNS 미존재가 도메인 미등록을 보장하지 않음. 실제 등록 가능 여부는 등록기관(가비아 등)에서 확인 필요.

### 검토 후 배제한 후보
| 후보 | 배제 사유 |
|---|---|
| **BeatDay** | **키프리스(KIPRIS)에 선점 상표 존재** (2026-09-11 사용자 확인). 앱스토어/GitHub/도메인은 비어 있었으나 상표권 충돌로 사용 불가 |
| 오늘맥박 | "맥박"이 거칠고 비전문적으로 읽힘. 시장 표준어는 "심박수" |
| 두근두근 | Play 스토어에 **완전동일 이름 앱 존재**(com.dreamy2g.pinksignal, 라이프스타일). 또한 30개 검색결과 대부분이 연애시뮬레이션·AI채팅 계열이라 "설렘"으로 먼저 읽힘 |
| DookDook / DooDoo | DookDook: GitHub·`dookdook.com` 선점. DooDoo: 영어에서 배설물 의미 |
| LubDub | App Store에 `LubDub - Heart Sound Recoder` 존재(카테고리 근접), GitHub·`lubdub.com` 선점 |
| Doki Doki | 글로벌 인지도는 최고이나 App Store/Play에 `DokiDoki` 앱 다수, `dokidoki.app` 선점 → 상표 리스크 |
| Cardiio / Cardio 계열 | 기존 앱과 혼동 위험 |

---

## 3. 브랜드 톤

`HeartTune`이 주는 인상: **"심장 리듬을 조율하다"** — 따뜻함 + 전문성 + 부정맥(리듬) 기능까지 이름에 담김.
`오늘심박`이 주는 인상: **매일 챙기는 습관형 건강 관리** — 친근함.

→ 두 이름의 조합: **"매일(오늘심박), 내 심장 리듬을 맞춘다(HeartTune)"**

- 카피 방향: "오늘 내 심장, 30초면 충분해요"
- 결과 표현: ~~"정상입니다(진단)"~~ → **"정상 범위예요"** (판정이 아닌 참고 정보)
- 색감: 미정 (차분한 의료 블루 / 다크+레드 / 민트 파스텔 중 택)

---

---

> 컨셉·명세는 `10-spec.md`, 기술 아키텍처는 `20-architecture.md`로 분리됨.
> 아래 4절은 영문명 선정 과정 원본 기록이다.


## 4. 영문명 선정 과정 (2026-09-11) — **결과: HeartTune 확정**

`BeatDay`가 키프리스에 선점되어 있어, **한국어 로마자 옮김을 배제한 순수 영어 단어 조합**으로 재선정.

### ✅ 최종 확정: HeartTune
| 항목 | 값 |
|---|---|
| 앱 이름 | **HeartTune** (하트튠) |
| 키프리스 | **동일 상표 없음** — 사용자 확인 완료 (2026-09-11) |
| App Store KR/US | 이름 일치 기존 앱 **0개** (실측) |
| Play 스토어 | 제목 일치 기존 앱 **없음** (실측) |
| GitHub | `hearttune` / `hearttune-app` / `hearttune-web` / `heart-tune` **모두 404 = 사용 가능** (실측) |
| 도메인 DNS | `hearttune.app` 없음 · `hearttune.kr` 없음 · `hearttune.com` 사용중 |
| 스토어 제목 | `HeartTune - Heart Rate Monitor` = **30자 (제한 30자, 딱 맞음)** |

> ⚠️ 스토어 제목이 30자 상한이라 **한 글자도 추가 불가**. 부제를 짧게 쓰려면 `HeartTune - Heart Rate`(22자) 또는 `HeartTune - HR Monitor`(22자).

> ⚠️ 미확인: 도메인 실제 등록 가능 여부. `whois` 미설치로 조회 불가, DNS 미존재만 확인됨 → 가비아 등 등록기관에서 확인 필요.

### 6-1. 앱스토어에서 동일명 앱이 이미 존재 → 배제
| 후보 | 충돌 앱 |
|---|---|
| PulseWise | PulseWise Heart Helper[Health], PulseWise: Heart Rate & Health[Health] |
| HeartSense | HeartSense: Pulse & Stress, Heartsense ECG[Medical] |
| PulsePoint | Heart Rate Monitor: PulsePoint[Health], 심박수 모니터: PulsePoint |
| PulseCheck | PulseCheck - Health Monitor[Health] |
| VitalPulse | VitalPulse: Heart Rate Monitor[Health] |
| PulseCare | PulseCare: BP & Heart Rate[Health] |
| PulseWave | PulseWave: 호흡과 수면[Health] |
| PulseWell / PulseCalm / DailyBeat / HeartPace / HeartFlow / DailyPulse / HeartLoop | 각 Health·Medical 계열 동일명 존재 |
| PulseRhythm | Play 스토어에 `Pulse Rhythm`, `Pulse Rhythm Tracker` 존재 |

### 6-2. 앱스토어 + 플레이스토어 동시 통과 — 최종 5개 후보 (→ HeartTune 채택)
| 영문명 | 한글 읽기 | App Store | Play | GitHub | 도메인 | 결과 |
|---|---|---|---|---|---|---|
| **HeartTune** | 하트튠 | 이름일치 0 | 없음 | `hearttune` 404 ✅ | `.app` `.kr` ✅ | **✅ 채택** |
| PulseDay | 펄스데이 | 이름일치 0 | 없음 | `pulseday` 404 ✅ | `.kr` ✅ / `.com`·`.app` 사용중 | 미채택 |
| EveryPulse | 에브리펄스 | KR·US 결과 0개 | 없음 | `everypulse` 404 ✅ | `.app` `.kr` ✅ | 미채택 |
| TodayPulse | 투데이펄스 | 이름일치 0 | 없음 | ❌ 선점 | `.app` `.kr` ✅ | 미채택 |
| GentlePulse | 젠틀펄스 | 이름일치 0 | 없음 | ❌ 선점 | `.app` `.kr` ✅ | 미채택 |

### 6-3. 스토어 제목 30자 제한 (실측)
| 제목 | 글자 수 | 판정 |
|---|---|---|
| PulseDay - Heart Rate Monitor | 29자 | ✅ |
| HeartTune - Heart Rate Monitor | 30자 | ✅ (여유 없음) |
| TodayPulse - Heart Rate Monitor | 31자 | ❌ → `TodayPulse - HR Monitor` (24자) |
| EveryPulse - Heart Rate Monitor | 31자 | ❌ → `EveryPulse - Heart Rate` (24자) |
| GentlePulse - Heart Rate Monitor | 32자 | ❌ → `GentlePulse - HR Monitor` (25자) |
| 오늘심박 - 심박수 측정기 | 14자 | ✅ |

### 6-4. 키프리스 확인 결과 (사용자 진행 완료)
- ✅ **HeartTune — 동일 상표 없음** (2026-09-11 확인)
- ❌ BeatDay — 선점 상표 존재 → 배제
- 확인 유사군: 제9류(앱 소프트웨어) · 제10류(의료용 측정기기) · 제42류(SaaS) · 제44류(의료·건강관리 서비스)

### 6-5. 미확인 사항
- ✅ 키프리스 상표 검색 — 사용자 확인 완료
- ⚠️ 도메인 실제 등록 가능 여부 — `whois` 미설치로 조회 불가. DNS 미존재만 확인됨 → 가비아 등 등록기관에서 확인 필요
