import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PPG_FIXTURES, readPpgFixture, omitFixtureStartup } from './helpers/ppg-fixtures.js';
import { analyzePpgSignal, resampleUniform, TARGET_FS } from '../src/dsp.js';

for (const fixture of PPG_FIXTURES) {
  test(`recorded PPG integrity and compatibility (not clinical truth): ${fixture.file}`, () => {
    const data = fs.readFileSync(new URL(`fixtures/ppg/${fixture.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), fixture.sha256);
    const samples = readPpgFixture(fixture.file);
    assert.equal(samples.length, fixture.rows);
    assert.ok(Math.abs((samples.at(-1).t - samples[0].t) / 1000 - fixture.spanSec) < 0.0001);
    assert.ok(samples.some((p, i) => i && p.t - samples[i - 1].t > 100));
    for (const [points, bpm] of [[samples, fixture.fullReplayBpm], [omitFixtureStartup(samples), fixture.replayBpm]]) {
      const result = analyzePpgSignal(resampleUniform(points, TARGET_FS), TARGET_FS);
      assert.equal(result.bpm, bpm);
      assert.equal(result.irregular, false, 'compatibility assertion only, not a normal-rhythm label');
      assert.equal(result.filterState.mode, 'tracking');
    }
    const cropped = analyzePpgSignal(resampleUniform(omitFixtureStartup(samples), TARGET_FS), TARGET_FS);
    assert.equal(cropped.cv, fixture.replayCv);
  });
}
