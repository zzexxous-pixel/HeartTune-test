import fs from 'node:fs';

export const PPG_FIXTURES = [
  { file: 'HeartTune_RawPPG_1792835198322.csv', rows: 408, spanSec: 29.8915, replayBpm: 76, fullReplayBpm: 78, replayCv: 0.039,
    sha256: '38ef268f75f0141d85c461e882704dfdef8eedfb1d0adcaaae1d267ce6ea69f0' },
  { file: 'HeartTune_RawPPG_1792835259342.csv', rows: 406, spanSec: 29.8439, replayBpm: 77, fullReplayBpm: 77, replayCv: 0.0342,
    sha256: 'c700c4c3dccd21dfb2b9d272b91052407b5df4de42670450c01ae703f5fd9dca' }
];

export function readPpgFixture(file) {
  const text = fs.readFileSync(new URL(`../fixtures/ppg/${file}`, import.meta.url), 'utf8');
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (header !== 'Index,TimeMs,RawValue') throw new Error('Unexpected PPG CSV header');
  const samples = lines.map((line, i) => {
    const [index, t, v] = line.split(',').map(Number);
    if (index !== i || !Number.isFinite(t) || !Number.isFinite(v) || v < 0 || v > 255) {
      throw new Error(`Invalid sample ${i}`);
    }
    return { t, v };
  });
  if (samples.some((p, i) => i > 0 && p.t <= samples[i - 1].t)) throw new Error('Non-monotonic timestamps');
  return samples;
}

// These older captures include a startup transient. Relative first-sample time
// approximates the capture start; do NOT apply this again to modern post-warmup exports.
export function omitFixtureStartup(samples) {
  return samples.filter((point) => point.t >= samples[0].t + 3000);
}
