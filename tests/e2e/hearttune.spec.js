/**
 * tests/e2e/hearttune.spec.js
 * 오늘심박 (HeartTune) — 로컬 서버 & GitHub Pages 겸용 E2E 테스트 스위트
 * 실행 명령어: npx playwright test
 */
import { test, expect } from '@playwright/test';

/** 문서가 실제로 스크롤되지 않는지(원스크린) 확인한다. */
async function expectNoPageScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

function expectZoneGeometryStable(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((rect, zoneIndex) => {
    rect.forEach((value, coordinateIndex) => {
      expect(Math.abs(value - expected[zoneIndex][coordinateIndex])).toBeLessThanOrEqual(0.5);
    });
  });
}

test.describe('오늘심박 (HeartTune) E2E 통합 검증', () => {
  test('1. 원스크린 렌더링, FOUC 방지, 48px CTA, 스크롤 없음 확인', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // GitHub Pages 하위 경로(/HeartTune-test/) 호환을 위해 상대경로('./') 사용
    await page.goto('./');

    // i18n 로드 완료 후 body.i18n-ready 클래스 활성화 확인
    const body = page.locator('body');
    await expect(body).toHaveClass(/i18n-ready/);

    await expect(page.locator('#appTitleTrigger')).toContainText('오늘심박');
    await expect(page.locator('.waveform-title')).toHaveText('카메라 측정 파형');

    // 처음 접속(저장된 이력 없음)에는 메시지 영역에 손가락 위치 와이어가 보인다.
    await expect(page.locator('#fingerGuide')).toBeVisible();
    await expect(page.locator('.finger-guide-art[data-facing-art="environment"] svg')).toBeVisible();

    const iconConfig = await page.evaluate(async () => {
      const manifest = await fetch('./manifest.webmanifest').then((response) => response.json());
      const favicon = document.querySelector('link[rel="icon"]').getAttribute('href');
      return {
        favicon,
        icons: manifest.icons.map((icon) => ({
          sizes: icon.sizes,
          purpose: icon.purpose,
          svg: decodeURIComponent(icon.src.slice(icon.src.indexOf(',') + 1))
        }))
      };
    });
    expect(iconConfig.favicon).toContain('translate(14 14) scale(.72)');
    expect(iconConfig.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of iconConfig.icons) {
      expect(icon.purpose).toContain('maskable');
      expect(icon.svg).toContain('scale(.72)');
    }

    // 첫 화면에는 법적 고지 푸터/탭이 없어야 한다 (결과 화면·시트로 이동)
    await expect(page.locator('.legal-footer')).toHaveCount(0);
    await expect(page.locator('.tab-nav')).toHaveCount(0);

    // 하단 Primary CTA 최소 터치 영역 48x48px 검증
    const ctaBtn = page.locator('#btnPrimaryMeasure');
    await expect(ctaBtn).toBeVisible();
    const box = await ctaBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(48);

    await expectNoPageScroll(page);

    // 짧은 휴대폰 화면에서도 하단 메시지 영역이 CTA를 침범하지 않는다.
    await page.setViewportSize({ width: 375, height: 568 });
    const compactMessage = await page.locator('.message-area').boundingBox();
    const compactCta = await page.locator('.cta-bar').boundingBox();
    expect(compactMessage.height).toBeLessThanOrEqual(150);
    expect(compactMessage.y + compactMessage.height).toBeLessThanOrEqual(compactCta.y + 0.5);
    expect(compactCta.y + compactCta.height).toBeLessThanOrEqual(568);
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

    await page.locator('#btnMenu').click();
    await page.locator('#menuGuide').click();
    const guideLink = page.locator('#guideRhythmLink');
    await expect(page.locator('#guideSheet')).toContainText('Arrhythmia');
    await expect(page.locator('#guideSheet')).toContainText('Tachycardia');
    await expect(page.locator('#guideSheet')).toContainText('Bradycardia');
    await expect(guideLink).toHaveText('Learn more');
    await expect(guideLink).toHaveAttribute('href', 'https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia');
    await expect(guideLink).toHaveAttribute('target', '_blank');
    await expect(guideLink).toHaveAttribute('rel', 'noopener noreferrer');
    await page.locator('#guideSheet [data-sheet-close]').click();

    await page.locator('#btnLangToggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(guideLink).toHaveAttribute('href', 'https://sev.severance.healthcare/sev/news/press/medical-report.do?mode=view&articleNo=129731&title=%5B%EC%84%B8%EB%B8%8C%EB%9E%80%EC%8A%A4%EB%B3%91%EC%9B%90%5D+%EB%B6%80%EC%A0%95%EB%A7%A5');
  });

  test('3. 링·파형·메시지 3영역 고정 및 제거된 조명/파형 설정 확인', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./');

    const ring = page.locator('.ring-zone');
    const waveform = page.locator('#waveformBox');
    const message = page.locator('.message-area');
    await expect(ring).toBeVisible();
    await expect(waveform).toBeVisible();
    await expect(message).toBeVisible();
    await expect(page.locator('.waveform-title')).toHaveText('카메라 측정 파형');
    await expect(page.locator('#btnScreenLight, #screenLightStrip, #btnWaveformToggle')).toHaveCount(0);

    const ringBox = await ring.boundingBox();
    const waveformBox = await waveform.boundingBox();
    const messageBox = await message.boundingBox();
    expect(ringBox.y).toBeLessThan(waveformBox.y);
    expect(waveformBox.y).toBeLessThan(messageBox.y);

    await page.locator('#btnSettings').click();
    await expect(page.locator('#settingsSheet')).toHaveClass(/open/);
    await expect(page.locator('#settingsSheet')).not.toContainText('화면 조명');
    await expect(page.locator('#settingsSheet')).not.toContainText('파형 보기');
    await page.locator('#settingsSheet [data-sheet-close]').click();
  });

  test('4. 스텔스 디버그 + 5초 고속 캘리브레이션(TRACKING) + 결과/법적 고지/이력 저장 검증', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // OS 공유 시트 지원 여부에 의존하지 않고 PNG 다운로드 폴백을 직접 검증한다.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    // 가상 클록 설치로 5초 초기 포착 및 15초 측정 완료를 고속 검증
    await page.clock.install();
    await page.goto('./');
    // 공유 시트를 배제하고 fallback 분기에서 브라우저가 PNG를 만드는지 검사한다.
    expect(await page.evaluate(() => ({
      share: typeof navigator.share,
      canShare: navigator.canShare({ files: [new File([], 'test.png', { type: 'image/png' })] })
    }))).toEqual({ share: 'undefined', canShare: false });

    // 측정 시간 15초 선택은 설정 시트에서 한다.
    await page.locator('#btnSettings').click();
    await page.locator('.dur-btn[data-duration="15"]').click();
    await page.locator('#settingsSheet [data-sheet-close]').click();

    const debugConsole = page.locator('#debugConsole');
    await expect(debugConsole).not.toHaveClass(/open/);

    // 상단 타이틀(#appTitleTrigger) 2초 내 5회 연속 클릭 → 스텔스 디버그 콘솔 오픈
    const titleTrigger = page.locator('#appTitleTrigger');
    for (let i = 0; i < 5; i++) {
      await titleTrigger.click();
    }
    await expect(debugConsole).toHaveClass(/open/);

    // 시뮬레이션 프리셋: 정상(72bpm) 선택
    await page.locator('.sim-preset[data-sim="normal"]').click();

    // 디버그 콘솔은 화면 하단을 덮는 오버레이이므로, 실제 사용자처럼 닫고 측정을 시작한다.
    await page.locator('#btnCloseDebug').click();
    await expect(debugConsole).not.toHaveClass(/open/);

    // 측정 시작 클릭
    const captureZones = () => page.evaluate(() => ['.ring-zone', '#waveformBox', '.message-area'].map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    }));
    const idleZones = await captureZones();
    const idleMessageBox = await page.locator('#stageGuideText').boundingBox();
    const ctaBtn = page.locator('#btnPrimaryMeasure');
    await ctaBtn.click();
    await expect(ctaBtn).toHaveText('측정 취소');
    const measuringZones = await captureZones();
    expectZoneGeometryStable(measuringZones, idleZones);
    const measuringMessageBox = await page.locator('#stageGuideText').boundingBox();
    expectZoneGeometryStable(
      [[measuringMessageBox.x, measuringMessageBox.y, measuringMessageBox.width, measuringMessageBox.height]],
      [[idleMessageBox.x, idleMessageBox.y, idleMessageBox.width, idleMessageBox.height]]
    );

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

    const resultZones = await captureZones();
    expectZoneGeometryStable(resultZones, idleZones);
    const resultMessageBox = await page.locator('#resultBanner').boundingBox();
    expectZoneGeometryStable(
      [[resultMessageBox.x, resultMessageBox.y, resultMessageBox.width, resultMessageBox.height]],
      [[idleMessageBox.x, idleMessageBox.y, idleMessageBox.width, idleMessageBox.height]]
    );

    const resultBanner = page.locator('#resultBanner');
    await expect(resultBanner).toHaveClass(/status-normal/);
    await expect(page.locator('#resultTitle')).toHaveText('정상 범위예요');
    const waveformSampleCount = await page.evaluate(() => {
      const record = JSON.parse(localStorage.getItem('hearttune_history_v1') || '[]')[0];
      return record?.waveform?.length || 0;
    });
    expect(waveformSampleCount).toBe(90);
    await expect(page.locator('#resultShortNote')).toBeVisible();
    await expect(page.locator('#btnShareImage')).toBeVisible();
    await expect(page.locator('#btnShareImage')).toContainText('공유');
    await expect(page.locator('#btnSaveImage')).toBeVisible();
    await expect(page.locator('#btnSaveImage')).toContainText('저장');
    await expect(page.locator('#fingerGuide')).toBeHidden();
    await expect(page.locator('#btnDetails')).toBeVisible();
    for (const type of ['arrhythmia', 'bradycardia', 'tachycardia']) {
      await expect(page.locator(`#detailsSheet [data-indicator="${type}"]`)).toHaveClass(/is-clear/);
    }

    // 결과 화면에 참고용 의료 고지가 보이고 "진단" 단어는 쓰지 않는다.
    const legalText = await resultBanner.innerText();
    expect(legalText).toContain('참고용');
    expect(legalText).not.toContain('진단');

    // 결과 상태에서도 짧은 휴대폰 화면의 메시지 상자가 CTA와 겹치지 않는다.
    await page.setViewportSize({ width: 375, height: 568 });
    const compactResult = await resultBanner.boundingBox();
    const compactResultCta = await page.locator('.cta-bar').boundingBox();
    expect(compactResult.height).toBeLessThanOrEqual(150);
    expect(compactResult.y + compactResult.height).toBeLessThanOrEqual(compactResultCta.y + 0.5);
    expect(compactResultCta.y + compactResultCta.height).toBeLessThanOrEqual(568);
    await page.setViewportSize({ width: 375, height: 667 });

    // 결과가 떠도 한 화면(스크롤 없음)이고 하단 CTA가 화면 안에 있다.
    await expectNoPageScroll(page);
    const shareBox = await page.locator('#btnShareImage').boundingBox();
    expect(shareBox.y + shareBox.height).toBeLessThanOrEqual(667);

    // 상세에는 사용자용 네 가지 항목만 표시하고, 기술용 지표와 스트레스 항목은 제외한다.
    await page.locator('#btnDetails').click();
    const detailsSheet = page.locator('#detailsSheet');
    await expect(detailsSheet).toHaveClass(/open/);
    for (const label of ['측정일시', '측정시간', '맥박', '카메라 측정 파형', '부정맥', '서맥', '빈맥', '측정 신호 품질']) {
      await expect(detailsSheet).toContainText(label);
    }
    await expect(page.locator('#detailsDate')).not.toBeEmpty();
    await expect(page.locator('#detailsDuration')).toHaveText('15초');
    await expect(page.locator('#detailsBpm')).not.toBeEmpty();
    const detailsText = await detailsSheet.innerText();
    expect(detailsText).not.toMatch(/\bCV\b|검출 박동|활성 채널|스트레스/);
    await detailsSheet.locator('[data-sheet-close]').click();

    // 브라우저별 다운로드 UI는 다르므로, 클릭된 Blob URL을 읽어 실제 PNG를 검증한다.
    await page.evaluate(() => {
      window.__shareDiagnostics = { buttonClicked: false, error: null };
      window.addEventListener('error', (event) => { window.__shareDiagnostics.error = event.message; });
      window.addEventListener('unhandledrejection', (event) => {
        window.__shareDiagnostics.error = String(event.reason?.stack || event.reason);
      });
      document.querySelector('#btnShareImage').addEventListener('click', () => {
        window.__shareDiagnostics.buttonClicked = true;
      }, { capture: true });
      const nativeClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function click(...args) {
        if (this.hasAttribute('download')) {
          window.__shareDownload = { href: this.href, fileName: this.download };
        }
        return nativeClick.apply(this, args);
      };
    });
    await page.locator('#btnShareImage').click();
    await page.waitForFunction(() => window.__shareDownload?.href || window.__shareDiagnostics.error, null, { timeout: 5000 }).catch(() => {});
    const shareDiagnostics = await page.evaluate(() => ({ ...window.__shareDiagnostics, href: window.__shareDownload?.href }));
    expect(shareDiagnostics.href, JSON.stringify(shareDiagnostics)).toBeTruthy();
    const pngBytes = await page.evaluate(async () => {
      const response = await fetch(window.__shareDownload.href);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    });
    const png = Buffer.from(pngBytes);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(1280);

    // [검증 D] 최근 30건 캘리브레이션 학습 큐(hearttune_calibration_v1)에 1건 저장
    await expect(page.locator('#calibStatusText')).toContainText('최근 1건 학습');

    // [검증 E] 메뉴 → 측정 이력 시트에서 일반 이력(hearttune_history_v1) 저장 여부 확인
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();
    await expect(page.locator('#historySheet')).toHaveClass(/open/);
    const historyItems = page.locator('#historyList .history-item');
    await expect(historyItems).toHaveCount(1);
    await expect(historyItems.first()).toContainText('정상');
    await expect(historyItems.first().locator('.history-signals')).toHaveClass(/is-normal/);
    await expect(historyItems.first()).not.toContainText('표시 신호 없음');
    await expect(historyItems.first()).not.toContainText('측정 신호 품질');
    await expect(historyItems.first()).not.toContainText('CV');
    await expect(historyItems.first()).not.toHaveClass(/is-active|is-clear/);
  });

  test('5. 이력 의심 문구·색상과 그래프 점 색상 검증', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hearttune_history_v1', JSON.stringify([
        { timestamp: 1792454400000, duration: 15, bpm: 55, status: 'irregular', irregular: true, quality: 80, waveform: [0, 1, 0, -1] },
        { timestamp: 1792368000000, duration: 30, bpm: 72, status: 'normal', irregular: false, quality: 75, waveform: [0, 1, 0, -1] },
        { timestamp: 1792281600000, duration: 30, bpm: 110, status: 'tachy', irregular: false, quality: 60, waveform: [0, 1, 0, -1] }
      ]));
    });
    await page.goto('./');
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();

    const items = page.locator('#historyList .history-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0).locator('.history-signals')).toHaveText('부정맥, 서맥 의심');
    await expect(items.nth(0).locator('.history-signals')).toHaveClass(/is-abnormal/);
    await expect(items.nth(0).locator('.history-bpm')).toHaveClass(/is-abnormal-rate/);
    await expect(items.nth(1).locator('.history-signals')).toHaveText('정상');
    await expect(items.nth(1).locator('.history-signals')).toHaveClass(/is-normal/);
    await expect(items.nth(2).locator('.history-signals')).toHaveText('빈맥 의심');
    await expect(items.nth(2).locator('.history-bpm')).toHaveClass(/is-abnormal-rate/);

    const textColors = await page.evaluate(() => [...document.querySelectorAll('.history-signals, .history-bpm')]
      .map((node) => getComputedStyle(node).color));
    expect(textColors).toContain('rgb(185, 28, 28)');
    expect(textColors).toContain('rgb(21, 128, 61)');
    expect(textColors).toContain('rgb(220, 38, 38)');

    // 그래프는 오래된 순(왼쪽→오른쪽)으로 점을 그린다: 110(빈맥) · 72(정상) · 55(부정맥/서맥)
    const dotClasses = await page.locator('#trendCanvas .trend-dot').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('class')));
    expect(dotClasses).toEqual(['trend-dot is-abnormal', 'trend-dot is-normal', 'trend-dot is-abnormal']);
  });

  test('6. 디버그 샌드박스 수동 필터 슬라이더 조작 시 MANUAL 모드 전환 및 자동 복귀 검증', async ({ page }) => {
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

  test('6. 기본값(브라우저 언어·후면 카메라·자동 시작 OFF)과 최소 화면 스크롤 없음 검증', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('./');

    // playwright.config.js 의 locale(ko-KR)을 브라우저 언어 기본값으로 사용
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');

    await page.locator('#btnSettings').click();
    await expect(page.locator('#settingsSheet')).toHaveClass(/open/);
    await expect(page.locator('.cam-btn[data-facing="environment"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cam-btn')).toHaveCount(2);
    await expect(page.locator('#waveformBox')).toBeVisible();
    await page.locator('#settingsSheet [data-sheet-close]').click();

    // 페이지 진입 시 카메라 미리보기가 자동으로 켜진다 (측정 시작 전 손가락 위치 조정).
    await expect
      .poll(() => page.evaluate(() => Boolean(document.querySelector('#cameraVideo').srcObject)), {
        timeout: 5000
      })
      .toBe(true);

    // 자동 시작 OFF: 카메라가 켜져 있어도 측정이 시작되지 않는다.
    await expect(page.locator('#bpmNumber')).toHaveText('--');
    await expect(page.locator('#btnPrimaryMeasure')).toHaveText('측정 시작');

    await expectNoPageScroll(page);
  });

  test('7. 디버그 창 상단 경계 드래그로 높이 조절(--debug-height) 검증', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./');

    const titleTrigger = page.locator('#appTitleTrigger');
    for (let i = 0; i < 5; i++) {
      await titleTrigger.click();
    }

    const debugConsole = page.locator('#debugConsole');
    await expect(debugConsole).toHaveClass(/open/);

    const before = await debugConsole.boundingBox();
    const logBefore = await page.locator('#debugLogList').boundingBox();
    const handle = page.locator('#debugResizeHandle');
    const handleBox = await handle.boundingBox();

    // 위로 80px 드래그 → 콘솔 높이 증가
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 80, { steps: 6 });
    await page.mouse.up();

    const after = await debugConsole.boundingBox();
    expect(after.height).toBeGreaterThan(before.height + 40);
    const logAfter = await page.locator('#debugLogList').boundingBox();
    // Logs expand with the console instead of staying capped at the old fixed height.
    expect(logAfter.height).toBeGreaterThan(logBefore.height + 40);
    // --debug-height 변수로 크기가 제어된다.
    const cssVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--debug-height').trim()
    );
    expect(cssVar).toMatch(/^\d+px$/);
  });
  test('8. 측정이력: 스와이프 삭제·결과 다시 보기·전체 삭제 확인·날짜 형식·그래프 축 검증', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hearttune_history_v1', JSON.stringify([
        { id: 'ht_3', timestamp: new Date(2026, 9, 21, 14, 5, 3).getTime(), bpm: 80, status: 'normal', irregular: false, quality: 80, duration: 30, waveform: [0, 1, 0, -1, 0.5] },
        { id: 'ht_2', timestamp: new Date(2026, 9, 20, 9, 17, 0).getTime(), bpm: 110, status: 'tachy', irregular: false, quality: 75, duration: 30, waveform: [0, 1, 0, -1] },
        { id: 'ht_1', timestamp: new Date(2026, 9, 19, 8, 54, 9).getTime(), bpm: 72, status: 'normal', irregular: false, quality: 70, duration: 15, waveform: [0, 1, 0, -1] }
      ]));
    });
    await page.goto('./');
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();
    await expect(page.locator('#historySheet')).toHaveClass(/open/);

    const items = page.locator('#historyList .history-item');
    await expect(items).toHaveCount(3);
    // 한국어 일시 형식 YYYY/MM/DD HH:mm:ss (24시간제), 측정 신호 품질 문구 없음
    await expect(items.nth(0)).toContainText('2026/10/21 14:05:03');
    await expect(items.nth(0)).not.toContainText('측정 신호 품질');
    // X축 날짜 라벨 M/D 3개, Y축 눈금 존재
    await expect(page.locator('#trendCanvas .trend-date')).toHaveCount(3);
    await expect(page.locator('#trendCanvas .trend-date').first()).toHaveText('10/19');
    await expect(page.locator('#trendYAxis .trend-tick').first()).toBeVisible();
    // 하단 광고 영역에는 법적 고지가 있다
    await expect(page.locator('#historyAdSlot')).toContainText('의료기기가 아니며');

    const row = items.nth(2).locator('.history-row');
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    const cy = box.y + box.height / 2;
    const startX = box.x + box.width - 20;

    // 드래그 중에도 빨간 삭제 버튼이 보이고, 중간에 놓으면 삭제하지 않는다
    await page.mouse.move(startX, cy);
    await page.mouse.down();
    await page.mouse.move(startX - 40, cy, { steps: 6 });
    await expect(items.nth(2).locator('.history-delete')).toBeVisible();
    await page.mouse.up();
    await expect(items).toHaveCount(3);
    await expect(items.nth(2)).not.toHaveClass(/is-open/);

    // 절반 이상 밀고 놓아도 완전히 밀지 않았으면 닫히고 삭제되지 않는다
    const boxHalf = await items.nth(2).locator('.history-row').boundingBox();
    const cyHalf = boxHalf.y + boxHalf.height / 2;
    await page.mouse.move(boxHalf.x + boxHalf.width - 20, cyHalf);
    await page.mouse.down();
    await page.mouse.move(boxHalf.x + boxHalf.width - 110, cyHalf, { steps: 6 });
    await page.mouse.up();
    await expect(items).toHaveCount(3);
    await expect(items.nth(2)).not.toHaveClass(/is-open/);
    await expect(page.locator('#historyUndoToast')).toBeHidden();

    // 끝까지 밀면 삭제 대기: 목록에서 숨기고 "삭제를 취소하시겠습니까?" 메시지
    const box2 = await items.nth(2).locator('.history-row').boundingBox();
    const cy2 = box2.y + box2.height / 2;
    await page.mouse.move(box2.x + box2.width - 20, cy2);
    await page.mouse.down();
    await page.mouse.move(box2.x - 60, cy2, { steps: 10 });
    await page.mouse.up();
    await expect(items).toHaveCount(2);
    await expect(page.locator('#historyUndoToast')).toBeVisible();
    await expect(page.locator('#historyUndoToast')).toContainText('삭제되었습니다.');
    // 삭제 취소: 목록에 복구되고 저장소에는 그대로 남아 있다
    await page.locator('#btnUndoDelete').click();
    await expect(items).toHaveCount(3);
    await expect(page.locator('#historyUndoToast')).toBeHidden();

    // 다시 끝까지 밀고 3초 기다리면 실제로 삭제된다
    const box3 = await items.nth(2).locator('.history-row').boundingBox();
    const cy3 = box3.y + box3.height / 2;
    await page.mouse.move(box3.x + box3.width - 20, cy3);
    await page.mouse.down();
    await page.mouse.move(box3.x - 60, cy3, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#historyUndoToast')).toBeVisible();
    await expect(page.locator('#historyUndoToast')).toBeHidden({ timeout: 5000 });
    await expect(items).toHaveCount(2);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hearttune_history_v1')).length);
    expect(stored).toBe(2);

    // 전체 삭제: 확인 취소 시 유지, 확인 시 비워짐
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('측정 이력을 모두 삭제하시겠습니까?');
      dialog.dismiss();
    });
    await page.locator('#btnClearHistory').click();
    await expect(items).toHaveCount(2);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#btnClearHistory').click();
    await expect(items).toHaveCount(0);
    await expect(page.locator('#historyList .history-empty')).toBeVisible();
  });

  test('10. 법적 고지 시트: 개인정보 처리방침(휴대폰 안 처리·최대 100건·직접 삭제) 표시', async ({ page }) => {
    await page.goto('./');
    await page.locator('#btnMenu').click();
    await page.locator('#menuLegal').click();
    await expect(page.locator('#legalSheet')).toHaveClass(/open/);
    await expect(page.locator('#legalSheet .privacy-title')).toHaveText('개인정보 처리방침');
    await expect(page.locator('#legalSheet')).toContainText('휴대폰의 브라우저 안에서');
    await expect(page.locator('#legalSheet')).toContainText('휴대폰 밖으로 전송되지 않습니다');
    await expect(page.locator('#legalSheet')).toContainText('최대 100건');
    await expect(page.locator('#legalSheet .privacy-list')).toBeVisible();
    await expect(page.locator('#legalSheet')).toContainText('직접 삭제');
    // 웹앱이므로 "서버가 없다"는 부정확한 문구는 쓰지 않는다.
    await expect(page.locator('#legalSheet')).not.toContainText('서버가 없');
  });

  test('9. 측정이력: 항목 선택 시 측정 결과 화면을 그대로 다시 보기', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hearttune_history_v1', JSON.stringify([
        { id: 'ht_a', timestamp: new Date(2026, 9, 21, 14, 5, 3).getTime(), bpm: 64, status: 'brady', irregular: false, quality: 80, duration: 30, waveform: [0, 1, 0, -1, 0.5, 0] }
      ]));
    });
    await page.goto('./');
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();
    await page.locator('#historyList .history-row').first().click();

    // 같은 시트 안에서 자세히 보기 화면으로 전환 (메인 결과 화면은 바뀌지 않는다)
    await expect(page.locator('#historySheet')).toHaveClass(/is-detail/);
    await expect(page.locator('#historySheet')).toHaveClass(/open/);
    await expect(page.locator('#historyDetailBody [data-role="bpm"]')).toHaveText('64');
    await expect(page.locator('#historyDetailBody [data-indicator="bradycardia"]')).toHaveClass(/is-active/);
    await expect(page.locator('body')).not.toHaveClass(/has-result/);
    await expect(page.locator('#btnHistoryDetailShare')).toBeVisible();
    await expect(page.locator('#btnHistoryDetailDelete')).toBeVisible();

    // 뒤로가기: 측정이력 목록으로 복귀
    await page.locator('#btnHistoryBack').click();
    await expect(page.locator('#historySheet')).not.toHaveClass(/is-detail/);
    await expect(page.locator('#historyList .history-row')).toHaveCount(1);
  });

  test('11. 자세히 보기에서 이미지 공유(저장) 버튼으로 PNG 내보내기', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hearttune_history_v1', JSON.stringify([
        { id: 'ht_s', timestamp: new Date(2026, 9, 21, 14, 5, 3).getTime(), bpm: 80, status: 'normal', irregular: false, quality: 80, duration: 30, waveform: [0, 1, 0, -1, 0.5, 0] }
      ]));
    });
    await page.goto('./');
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();
    await page.locator('#historyList .history-row').first().click();
    await expect(page.locator('#historySheet')).toHaveClass(/is-detail/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btnHistoryDetailShare').click()
    ]);
    expect(download.suggestedFilename()).toMatch(/^HeartTune_80bpm_\d+\.png$/);
  });

  test('13. 시트 손잡이 드래그: 살짝 끌면 제자리로, 충분히 끌면 닫힌다', async ({ page }) => {
    await page.goto('./');
    await page.locator('#btnSettings').click();
    const sheet = page.locator('#settingsSheet');
    await expect(sheet).toHaveClass(/open/);
    // 슬라이드 인 애니메이션이 끝난 뒤 손잡이 좌표를 잡는다.
    await page.waitForTimeout(400);

    const grab = page.locator('#settingsSheet .sheet-grab');
    const box = await grab.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 살짝만 끌면 시트가 그대로 유지된다
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 30, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).toHaveClass(/open/);

    // 충분히 아래로 끌면 닫힌다
    const box2 = await grab.boundingBox();
    const cx2 = box2.x + box2.width / 2;
    const cy2 = box2.y + box2.height / 2;
    await page.mouse.move(cx2, cy2);
    await page.mouse.down();
    await page.mouse.move(cx2, cy2 + 170, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).not.toHaveClass(/open/);
  });

  test('12. 브라우저 뒤로가기: 자세히 보기 → 목록 → 시트 닫기 → 메인 초기화 (앱 밖으로 나가지 않음)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hearttune_history_v1', JSON.stringify([
        { id: 'ht_b', timestamp: new Date(2026, 9, 21, 14, 5, 3).getTime(), bpm: 80, status: 'normal', irregular: false, quality: 80, duration: 30, waveform: [0, 1, 0, -1] }
      ]));
    });
    await page.goto('./');
    const appUrl = page.url();
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();
    await page.locator('#historyList .history-row').first().click();
    await expect(page.locator('#historySheet')).toHaveClass(/is-detail/);

    // 자세히 보기 → 측정이력 목록
    await page.goBack();
    await expect(page.locator('#historySheet')).not.toHaveClass(/is-detail/);
    await expect(page.locator('#historySheet')).toHaveClass(/open/);

    // 측정이력 시트 → 닫힘
    await page.goBack();
    await expect(page.locator('#historySheet')).not.toHaveClass(/open/);

    // 메인에서 뒤로가기 → 앱 주소로 초기 화면 (앱을 벗어나지 않음)
    await page.goBack();
    await expect(page.locator('#btnMenu')).toBeVisible({ timeout: 15000 });
    expect(page.url()).toBe(appUrl);
    await expect(page.locator('#historySheet')).not.toHaveClass(/open/);
  });
});
