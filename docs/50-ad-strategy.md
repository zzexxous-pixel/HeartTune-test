# 50 · 광고 전략 (Ad Strategy)

> 최종 갱신: 2026-10-21 (KST) · 상태: **방향 확정 / 네트워크 미정 / 구현은 "법적 고지 문구"만 적용**
> 관련 문서: `10-spec.md` 4-5b·4-7 · `agent.md` 2-5·7절 · `30-algorithm-dsp.md`(측정 신호는 광고와 무관)

이 문서는 두 부분으로 나뉜다.

- **Part A. 범용 원칙** — 건강·측정류 웹앱/PWA 어디에나 적용할 수 있는 광고 설계 원칙. 다른 프로젝트에 복사해 써도 된다.
- **Part B. 오늘심박(HeartTune) 특화 결정** — 이 제품의 화면 구조, 데이터 정책, 중장년 타깃에 맞춘 구체적 결정.

---

## Part A. 범용 원칙 (Universal)

### A-1. 기본 철학
1. **광고는 사용자가 능동적으로 연 화면에만 둔다.** 페이지 진입·작업 완료 직후·결과 확인 중에는 광고를 띄우지 않는다.
2. **핵심 작업 구역은 보호한다.** 측정, 입력, 결제, 결과 확인처럼 사용자가 집중하는 구간에는 광고가 끼어들지 않는다. 이는 Kakao AdFit 운영정책이 "중요 정보 확인·결제·입력·본인확인 중 노출 금지"로 명시한 원칙과도 같다. [1](https://adfit.kakao.com/web/html/use_kakao.html)
3. **광고를 콘텐츠처럼 꾸미지 않는다.** 광고 자리는 "광고" 라벨과 명확한 시각 구분을 가진다. NN/g는 광고처럼 보이는 요소가 무시되거나 혼동을 일으킨다는 것을 보였다. [2](https://www.nngroup.com/articles/fancy-formatting-looks-like-an-ad/)
4. **오클릭을 설계 단계에서 막는다.** 광고 주변에 링크·버튼·내비게이션을 두지 않는다. 광고 닫기 버튼은 광고 영역 안에 둔다. 모바일에서는 우연한 탭이 많아 특히 중요하다. [1](https://adfit.kakao.com/web/html/use_kakao.html)
5. **광고 품질 표준을 기준선으로 삼는다.** Better Ads Standards는 모바일 웹에서 팝업, 콘텐츠 전 전면 광고(프리스티셜), 카운트다운 포스티셜, 큰 고정 광고, 전면 스크롤오버, 광고 밀도 30% 초과 등을 금지한다. [3](https://www.betterads.org/press-releases/updated-standards-desktop-mobile-web) · [4](https://ppc.land/coalition-for-better-ads/)
   - 광고 밀도는 메인 콘텐츠 높이 대비 광고 높이의 합으로 계산한다. 헤더·푸터·내비게이션은 제외한다. [4](https://ppc.land/coalition-for-better-ads/)
   - Chrome은 실패 판정이 나면 30일 안에 고치지 않을 때 광고를 필터링할 수 있다. [4](https://ppc.land/coalition-for-better-ads/)
6. **데이터 최소 수집, 맥락 기반 광고.** 민감한 측정 데이터는 광고 타겟팅에 쓰지 않는다. 광고는 페이지 맥락으로만 고른다.
7. **수익보다 신뢰를 우선한다.** 광고 수익은 부수적이다. 이를 수치 목표보다 먼저 정해 두면 배치 논쟁이 줄어든다.

### A-2. 배치 설계 체크리스트
- [ ] 광고 위치가 사용자가 연 화면(시트·모달·설정) 안인가?
- [ ] 핵심 CTA에서 최소 8px 이상, 가능하면 48px 이상 떨어져 있는가?
- [ ] 광고 안에 닫기 버튼이 있고 48×48px 이상인가?
- [ ] 광고 영역이 레이아웃 흔들림(CLS)을 일으키지 않도록 높이를 미리 예약했는가?
- [ ] 광고 로드 실패·오프라인 시 빈 칸 없이 접히는가?
- [ ] 광고가 "추천", "유용한 링크"처럼 콘텐츠 제목 아래에 있지 않은가? [1](https://adfit.kakao.com/web/html/use_kakao.html)
- [ ] 전면 광고는 사용자가 명확히 특정 동작(앱 시작·화면 전환)을 한 경우에만 1회 노출되는가? [1](https://adfit.kakao.com/web/html/use_kakao.html)

### A-3. 플랫폼 정책 공통 체크
- **Google Play**: 방해형 광고 금지. 사용 흐름을 방해하는 광고는 5초 후 닫을 수 있어야 한다. 한 페이지에 여러 광고 배치도 금지된다. [5](https://support.google.com/googleplay/android-developer/answer/17517561?hl=en)
- **Apple App Store**: 건강 측정 데이터(카메라 API 포함)를 광고·마케팅·사용 기반 데이터 마이닝에 쓰면 안 된다. 측정 정확도 근거와 의사 상담 권고 문구가 필요하다. [6](https://developer.apple.com/app-store/review/guidelines/)
- **Google Ads 건강 카테고리**: 처방약, 미승인 물질, 보충제, 건강 효능 과장 광고는 제한되거나 금지된다. 광고 네트워크 카테고리 차단을 설정해야 한다. [7](https://support.google.com/adspolicy/answer/176031?hl=en)
- **Google Play 건강 앱 면책**: 규제 승인이 없는 건강 앱은 "의료기기가 아니며 진단·치료·예방하지 않는다"는 면책 문구가 필요하다. [8](https://support.google.com/googleplay/android-developer/answer/15406346?hl=en)

### A-4. 측정 로직과 광고 간 기술 원칙
- 측정 루프(프레임 샘플링)가 도는 동안에는 광고 스크립트를 로드하거나 실행하지 않는다. 메인 스레드 경쟁은 샘플링 품질에 영향을 줄 수 있다. **(가설: 실기기 CSV 비교로 검증 필요)**
- 광고 요청에 측정값·이력·카메라 신호를 실어 보내지 않는다.
- 광고 스크립트는 서비스 워커 캐시 대상이 아니다. 외부 호출 실패가 앱 기능을 막으면 안 된다.

### A-5. 단계적 도입 로드맵 (범용)
1. 광고 없이 측정·이력 데이터와 방문 패턴을 먼저 확인한다.
2. 자체 공익·자사 기능 배너로 슬롯을 검증한다(수익 0, 정책 리스크 최소).
3. 네트워크를 붙이고 오클릭률·이탈·재방문을 공익 배너와 비교한다.
4. 광고 제거 옵션은 수요가 확인된 뒤 검토한다.

---

## Part B. 오늘심박(HeartTune) 특화 결정

### B-1. 확정된 결정 (2026-10-21, 사용자 확인)
| 항목 | 결정 |
|---|---|
| 수익 목표 | **신뢰와 사용성 우선, 수익은 부수적** |
| 광고 네트워크 | **미정** (후보: 카카오 애드핏 / Google AdSense / 자체·공익 배너) |
| 광고 제거 유료 옵션 | **없음** |
| 제휴 쇼핑 링크 | **보류** |
| 광고 위치 | **측정이력 시트 하단에만** |
| 광고 영역 현재 내용 | **법적 고지 문구**(의료기기 아님·참고용·기기 내 저장 고지) |

### B-2. 화면 적용 (측정이력 시트)
- 구성: **그래프(고정 Y축 + 가로 스크롤 X축) → 상세 목록(세로 스크롤) → 하단 광고 영역(고정)**
- 광고 영역은 시트 하단에 고정 배치되며, 목록만 스크롤된다. 메인 화면(링·파형·메시지·CTA)에는 광고가 없다.
- 광고 자리 예시: `images/A-recommended-history-sheet-ad.png` (로컬 시안, 저장소 외부)

### B-3. 광고 금지 구역 (HeartTune 고정 규칙)
| 구역 | 이유 |
|---|---|
| 메인 화면 링·파형·메시지·하단 CTA (대기·측정·결과 전부) | 측정 집중, 오클릭 위험, 첫 화면 100dvh 원칙 |
| 측정 직후 전면 광고(프리스티셜·포스티셜) | 결과 확인 방해, 건강 불안 유발, Better Ads 위반 |
| 결과 메시지 영역 옆·아래 | 건강 결과와 광고가 섞여 오해 소지 |
| 공유 이미지(PNG) | 가족 전달 이미지의 신뢰 훼손 |
| 측정 중 화면 전체 | 손가락 측정 중 조작 불가, 광고 가치 없음 |

### B-4. 개인정보·데이터 원칙 (HeartTune 특화)
- 광고 요청에 BPM·측정 이력·카메라 신호·기기 내 측정 기록을 넘기지 않는다.
- **맞춤형(행동 기반) 광고는 끈다.** 페이지 맥락 기반 광고만 사용한다.
- 광고 네트워크가 붙으면 개인정보 처리방침과 법적 고지 문구를 갱신한다.
  - 현재 문구 "카메라 영상은 … 외부 서버로 절대 전송되지 않습니다"는 여전히 참이지만, 광고 SDK 도입 후에는 "광고 네트워크에 광고 요청이 전송될 수 있음"을 추가 고지해야 한다.
  - 맞춤형 광고 관련 한국 법령은 **확인 필요(미확인)**.
- 이력 데이터는 기기 로컬(localStorage)에만 있으며, 광고 관련 경로로 나가지 않는다.

### B-5. 타깃(중장년) 특화 원칙
- 광고 닫기 버튼은 48×48px 이상, 광고 영역 안에 둔다.
- 광고 텍스트는 본문 18px 이상 원칙을 따른다(광고 제공사 규격 허용 범위 내).
- "추천", "무료 검사", "할인" 같은 긴박감 문구는 쓰지 않는다. 건강 불안을 자극하는 카피는 금지한다.
- 건강기능식품·보충제·의료기기·병원 광고는 **차단 목록**으로 지정한다. 예시 시안 C(영양제 전면 광고)는 이 기준에 맞지 않는 예다.

### B-6. 네트워크별 메모 (미정, 비교용)
| 항목 | 카카오 애드핏 | Google AdSense |
|---|---|---|
| 한국어 중장년 친화 | 높음 | 보통 |
| 건강 카테고리 정책 | 운영정책 명확(오클릭·위치 조항 상세) [1](https://adfit.kakao.com/web/html/use_kakao.html) | 건강 카테고리 제한 존재 [7](https://support.google.com/adspolicy/answer/176031?hl=en) |
| 규격 | 320×50, 320×100, 300×250, 728×90 등 [9](https://adfit.github.io/wiki/web-guide/) | 반응형 등 |
| 자동 광고 | 수동 슬롯 권장 | **자동 광고 금지**, 수동 슬롯만 |
| 매체 심사 | 필요 | 필요 |

### B-7. 미확인·후속 확인 항목
- 한국 건강기능식품·의료기기 광고 사전 심의 범위(본 앱 자체는 의료기관이 아니지만 광고 소재에 따라 검토 필요). 의료법 제56조 관련 규정은 원문 확인이 필요하다. [10](https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1000916672&chrClsCd=010202)
- 맞춤형 광고 관련 법령과 개인정보 처리방침 개정 범위.
- 쇼핑 제휴 시 추천·보증 표시 의무(보류 중이므로 도입 전 확인).

---

## 참고 자료
1. Kakao AdFit 운영정책 — https://adfit.kakao.com/web/html/use_kakao.html
2. NN/g, Fancy Formatting = Looks Like a Promotion = Ignored — https://www.nngroup.com/articles/fancy-formatting-looks-like-an-ad/
3. Coalition for Better Ads, 업데이트 표준 (2026-01) — https://www.betterads.org/press-releases/updated-standards-desktop-mobile-web
4. PPC Land, Coalition for Better Ads 설명 (광고 밀도 정의·Chrome 평가) — https://ppc.land/coalition-for-better-ads/
5. Google Play Developer Program Policy (Disruptive ads) — https://support.google.com/googleplay/android-developer/answer/17517561?hl=en
6. Apple App Review Guidelines 1.4.1 · 5.1.2 — https://developer.apple.com/app-store/review/guidelines/
7. Google Ads Healthcare and medicines policy — https://support.google.com/adspolicy/answer/176031?hl=en
8. Google Play Health Content and Services — https://support.google.com/googleplay/android-developer/answer/15406346?hl=en
9. Kakao AdFit Web Guide (규격) — https://adfit.github.io/wiki/web-guide/
10. 의료법 제56조 (국가법령정보센터) — https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1000916672&chrClsCd=010202
11. NN/g, Banner Blindness Revisited — https://www.nngroup.com/articles/banner-blindness-revisited-users-dodge-ads-mobile-and-desktop/
