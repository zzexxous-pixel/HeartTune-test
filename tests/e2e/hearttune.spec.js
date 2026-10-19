/**
 * tests/e2e/hearttune.spec.js
 * 오늘심박 (HeartTune) — 로컬 서버 & GitHub Pages 겸용 E2E 테스트 스위트
 * 실행 명령어: npx playwright test
 */
import { test, expect } from '@playwright/test';

test.describe('오늘심박 (HeartTune) E2E 통합 검증', () => {
  test('1. 초기 렌더링, FOUC 방지 클래스, 중장년 타깃 최소 버튼 크기(48px) 및 비의료기기 법적 고지 확인', async ({ page }) => {
    // GitHub Pages 하위 경로(/HeartTune-test/) 호환을 위해 상대경로('./') 사용
    await page.goto('./');

    // i18n 로드 완료 후 body.i18n-ready 클래스 활성화 확인
    const body = page.locator('body');
    await expect(body).toHaveClass(/i18n-ready/);

    // 앱 이름 및 비의료기기 법적 고지 표시 확인 ("진단" 단어 미사용 원칙)
    await expect(page.locator('#appTitleTrigger')).toContainText('오늘심박');
    const footerText = await page.locator('.legal-footer').innerText();
    expect(footerText).toContain('참고용 정보');
    expect(footerText).not.toContain('진단');

    // 우측 끝 Primary CTA(#btnPrimaryMeasure) 최소 터치 영역 48x48px 검증
    const ctaBtn = page.locator('#btnPrimaryMeasure');
    await expect(ctaBtn).toBeVisible();
    const box = await ctaBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(48);
  });

  test('2. 한국어(KO) ↔ 영어(EN) 다국어 실시간 전환 및 새로고침 후 유지 검증', async ({ page }) => {
    await page.goto('./');

    const langBtn = page.locator('#btnLangToggle');
    await expect(langBtn).toHaveText('EN');

    // 영어로 전환
    await langBtn.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#btnPrimaryMeasure')).toHaveText('Start Measure');
    await expect(page.locator('#appTitleTrigger')).toContainText('HeartTune');

    // 새로고침 후에도 영어 설정 유지 확인
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#btnPrimaryMeasure')).toHaveText('Start Measure');
  });

  test('3. 전면 카메라용 상단 화면 조명 스트립(#btnScreenLight) 토글 동작 검증', async ({ page }) => {
    await page.goto('./');

    const lightStrip = page.locator('#screenLightStrip');
    const lightBtn = page.locator('#btnScreenLight');

    await expect(lightStrip).not.toHaveClass(/active/);

    await lightBtn.click();
    await expect(lightStrip).toHaveClass(/active/);
    await expect(lightBtn).toContainText('조명 켜짐');

    await lightBtn.click();
    await expect(lightStrip).not.toHaveClass(/active/);
  });

  test('4. 스텔스 디버그 콘솔(타이틀 5연타) + 5초 고속 캘리브레이션(TRACKING) + 완료 후 이력 및 30건 학습 큐 저장 검증', async ({ page }) => {
    // 가상 클록 설치로 5초 초기 포착 및 15초 측정 완료를 고속 검증
    await page.clock.install();
    await page.goto('./');

    const debugConsole = page.locator('#debugConsole');
    await expect(debugConsole).not.toHaveClass(/open/);

    // 상단 타이틀(#appTitleTrigger) 2초 내 5회 연속 클릭 → 스텔스 디버그 콘솔 오픈
    const titleTrigger = page.locator('#appTitleTrigger');
    for (let i = 0; i < 5; i++) {
      await titleTrigger.click();
    }
    await expect(debugConsole).toHaveClass(/open/);

    // 시뮬레이션 프리셋: 정상(72bpm) 선택 및 15초 측정 모드 선택
    await page.locator('.sim-preset[data-sim="normal"]').click();
    await page.locator('.dur-btn[data-duration="15"]').click();

    // 디버그 콘솔은 화면 하단을 덮는 오버레이이므로, 실제 사용자처럼 닫고 측정을 시작한다.
    // (열어 둔 채로는 하단 Primary CTA 가 가려져 클릭이 차단된다)
    await page.locator('#btnCloseDebug').click();
    await expect(debugConsole).not.toHaveClass(/open/);

    // 측정 시작 클릭
    const ctaBtn = page.locator('#btnPrimaryMeasure');
    await ctaBtn.click();
    await expect(ctaBtn).toHaveText('측정 취소');

    // [구간 A] 0 ~ 4초: 초기 신호 수집 구간이므로 아직 BPM은 '--' 유지
    for (let sec = 0; sec < 4; sec++) {
      await page.clock.runFor(1000);
    }
    await expect(page.locator('#bpmNumber')).toHaveText('--');

    // [구간 B] 5 ~ 6초 도달: 5초 고속 초기 캘리브레이션 발동 → 첫 BPM 수치 표시 및 TRACKING 모드 진입
    await page.clock.runFor(2500);
    const earlyBpmText = await page.locator('#bpmNumber').innerText();
    expect(earlyBpmText).not.toBe('--');
    const earlyBpm = Number(earlyBpmText);
    expect(earlyBpm).toBeGreaterThanOrEqual(66);
    expect(earlyBpm).toBeLessThanOrEqual(78);
    await expect(page.locator('#calibStatusText')).toContainText('TRACKING');

    // [구간 C] 15초 측정 종료까지 진행: 최종 BPM 확정 + 정상 배지 + 15초 단기 측정 안내 표시
    for (let sec = 6; sec <= 16; sec++) {
      await page.clock.runFor(1000);
    }

    const finalBpm = Number(await page.locator('#bpmNumber').innerText());
    expect(finalBpm).toBeGreaterThanOrEqual(68);
    expect(finalBpm).toBeLessThanOrEqual(76);

    const resultBanner = page.locator('#resultBanner');
    await expect(resultBanner).toHaveClass(/status-normal/);
    await expect(page.locator('#resultTitle')).toHaveText('정상 범위예요');
    await expect(page.locator('#resultShortNote')).toBeVisible();
    await expect(page.locator('#btnShareImage')).toBeVisible();

    // [검증 D] 최근 30건 캘리브레이션 학습 큐(hearttune_calibration_v1)에 1건 저장되어 상단 배너가 갱신되었는지 확인
    await expect(page.locator('#calibStatusText')).toContainText('최근 1건 학습');

    // [검증 E] 측정이력 탭으로 이동하여 일반 이력(hearttune_history_v1) 저장 여부 확인
    await page.locator('.tab-btn[data-tab="history"]').click();
    const historyItems = page.locator('#historyList .history-item');
    await expect(historyItems).toHaveCount(1);
    await expect(historyItems.first()).toContainText('정상 범위예요');
  });

  test('5. 디버그 샌드박스 수동 필터 슬라이더 조작 시 MANUAL 모드 전환 및 자동 복귀 검증', async ({ page }) => {
    await page.goto('./');

    // 타이틀 5연타로 디버그 콘솔 오픈
    const titleTrigger = page.locator('#appTitleTrigger');
    for (let i = 0; i < 5; i++) {
      await titleTrigger.click();
    }

    const filterModeLabel = page.locator('#lblFilterMode');
    await expect(filterModeLabel).toContainText('AUTO');

    // HPF 슬라이더 값을 0.95Hz로 변경하고 input 이벤트 발생
    const hpSlider = page.locator('#sliderHpCutoff');
    await hpSlider.fill('0.95');
    await hpSlider.dispatchEvent('input');

    await expect(filterModeLabel).toContainText('MANUAL');
    await expect(page.locator('#lblHpCutoff')).toHaveText('0.95');

    // [자동 모드로 복귀] 버튼 클릭 시 다시 AUTO 모드로 전환 확인
    await page.locator('#btnResetAutoTune').click();
    await expect(filterModeLabel).toContainText('AUTO');
  });
});