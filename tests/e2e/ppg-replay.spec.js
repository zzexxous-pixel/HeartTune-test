import { test, expect } from '@playwright/test';
import { PPG_FIXTURES, readPpgFixture, omitFixtureStartup } from '../helpers/ppg-fixtures.js';

// Software replay only: raw fixture -> browser DSP -> local history/detail UI.
// This does not simulate optical sensor acquisition or provide clinical truth.
for (const fixture of PPG_FIXTURES) {
  test(`recorded CSV browser replay and history: ${fixture.file}`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('./');
    const replay = await page.evaluate(async (samples) => {
      const { analyzePpgSignal, resampleUniform, TARGET_FS } = await import(new URL('./src/dsp.js', location.href).href);
      const result = analyzePpgSignal(resampleUniform(samples, TARGET_FS), TARGET_FS);
      const record = {
        id: 'recorded-fixture', timestamp: Date.UTC(2026, 9, 27, 0), duration: 30,
        bpm: result.bpm, status: result.status, irregular: result.irregular,
        cv: result.cv, rmssdMs: result.rmssdMs, quality: result.qualityScore,
        beatCount: result.beatCount, isShortMeasurement: result.isShortMeasurement,
        waveform: samples.slice(-90).map((p) => p.v)
      };
      localStorage.setItem('hearttune_history_v1', JSON.stringify([record]));
      return { bpm: result.bpm, cv: result.cv, waveformLength: record.waveform.length };
    }, omitFixtureStartup(readPpgFixture(fixture.file)));
    expect(replay.bpm).toBe(fixture.replayBpm);
    expect(replay.cv).toBe(fixture.replayCv);
    expect(replay.waveformLength).toBe(90);
    await page.locator('#btnMenu').click();
    await page.locator('#menuHistory').click();
    const row = page.locator('#historyList .history-row');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.history-bpm')).toContainText(String(fixture.replayBpm));
    await row.click();
    const details = page.locator('#historyDetailBody');
    await expect(details).toBeVisible();
    await expect(details.locator('[data-role="bpm"]')).toHaveText(String(fixture.replayBpm));
    await expect(details.locator('canvas[data-role="waveform"]')).toBeVisible();
  });
}

test('40 BPM synthetic signal uses low-range tracking in the browser, without treating prior as measurement', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { generateSyntheticPPG, analyzePpgSignal, TARGET_FS } = await import(new URL('./src/dsp.js', location.href).href);
    const { canDisplayLiveBpm } = await import(new URL('./src/features/measurement-policy.js', location.href).href);
    const analysis = analyzePpgSignal(generateSyntheticPPG({ bpm: 40, durationSec: 27, noiseAmp: 0.2, seed: 42 }), TARGET_FS,
      { priorBpm: 72, prevFilter: { hp: 0.7, lp: 4, centerBpm: 72, locked: false } });
    return { bpm: analysis.bpm, mode: analysis.filterState.mode, displayable: canDisplayLiveBpm(analysis), status: analysis.status };
  });
  expect(result.bpm).toBeGreaterThanOrEqual(40);
  expect(result.bpm).toBeLessThanOrEqual(43);
  expect(result.mode).toBe('tracking');
  expect(result.displayable).toBe(true);
  expect(result.status).toBe('brady');
});
