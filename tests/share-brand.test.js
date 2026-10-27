import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('PNG brand uses the header gradient, corner radius and heart geometry', () => {
  const source = fs.readFileSync(new URL('../src/features/share.js', import.meta.url), 'utf8');
  const body = source.match(/function drawBrandMark\(ctx, x, y, size\) \{([\s\S]*?)\n\}/)[1];
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const header = html.match(/<span class="brand-heart"[\s\S]*?<\/span>/)[0];
  assert.ok(header.includes('rx="26"'));
  assert.ok(header.includes('translate(3.67 6.45) scale(.9266)'));
  const calls = [];
  const gradient = { addColorStop: (...args) => calls.push(['stop', ...args]) };
  const ctx = new Proxy({}, { get: (_, key) => key === 'createLinearGradient'
    ? (...args) => { calls.push([key, ...args]); return gradient; }
    : (...args) => calls.push([key, ...args]) });
  vm.runInNewContext(`(function(ctx, x, y, size) {${body}})(ctx, 0, 0, 100)`, {
    ctx, COLORS: { brandBg: '#B61C32' }, Path2D: class { constructor(path) { this.path = path; } }
  });
  for (const expected of [
    ['roundRect', 0, 0, 100, 100, 26], ['createLinearGradient', 0, 0, 100, 100],
    ['stop', 0, '#FF1053'], ['stop', 1, '#350020'],
    ['translate', 3.67, 6.45], ['scale', 0.9266, 0.9266]
  ]) assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(expected)), JSON.stringify(expected));
});
