import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script id="environment-config">([\s\S]*?)<\/script>/)[1];
const productionTitle = html.match(/<title>(.*?)<\/title>/)[1];

function configure(pathname) {
  const manifest = { href: './manifest.webmanifest', setAttribute(key, value) { this[key] = value; } };
  const apple = { content: '오늘심박' };
  const document = {
    title: productionTitle,
    documentElement: { dataset: {} },
    querySelector(selector) {
      return selector === 'link[rel="manifest"]' ? manifest : apple;
    }
  };
  vm.runInNewContext(script, { location: { pathname }, document });
  return { document, manifest, apple };
}

for (const [environment, paths] of Object.entries({
  dev: ['/HeartTune-test/', '/HeartTune-test/index.html'],
  pre: ['/HeartTune-test/preview/', '/HeartTune-test/preview/index.html']
})) {
  test(`environment ${environment}: path, title and static install manifest`, () => {
    for (const pathname of paths) {
      const { document, manifest, apple } = configure(pathname);
      assert.equal(document.documentElement.dataset.environment, environment);
      assert.equal(document.title, `${productionTitle} ${environment}`);
      assert.equal(manifest.href, `./manifest-${environment}.webmanifest`);
      assert.equal(apple.content, `하루심박 ${environment}`);
      const data = JSON.parse(fs.readFileSync(new URL(`../manifest-${environment}.webmanifest`, import.meta.url), 'utf8'));
      assert.equal(data.name, apple.content);
      assert.equal(data.short_name, apple.content);
      assert.equal(data.start_url, './index.html');
      assert.equal(data.scope, './');
      const production = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
      assert.deepEqual({ ...data, name: production.name, short_name: production.short_name }, production);
      assert.equal(new URL(data.start_url, new URL(manifest.href, `https://example.com${pathname.endsWith('/') || pathname.endsWith('.html') ? pathname : pathname + '/'}`)).pathname,
        environment === 'pre' ? '/HeartTune-test/preview/index.html' : '/HeartTune-test/index.html');
    }
  });
}

test('production and unrelated paths retain original branding', () => {
  for (const pathname of ['/HeartTune/', '/HeartTune/index.html', '/', '/HeartTune-test-other/', '/other/HeartTune-test/preview/']) {
    const { document, manifest, apple } = configure(pathname);
    assert.equal(document.documentElement.dataset.environment, undefined);
    assert.equal(document.title, productionTitle);
    assert.equal(manifest.href, './manifest.webmanifest');
    assert.equal(apple.content, '오늘심박');
  }
  const data = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(data.name, '오늘심박 - 심박수 측정기 (HeartTune)');
  assert.equal(data.short_name, '오늘심박');
});

test('preview matches a complete segment, not a preview-like name', () => {
  assert.equal(configure('/HeartTune-test/preview-other/').document.documentElement.dataset.environment, 'dev');
});
