import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const origin = 'http://hearttune.localhost';
const productionTitle = '오늘심박 - 심박수 측정기 | HeartTune - Heart Rate Monitor';
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

// 실제 Pages처럼 동일한 정적 파일을 각 저장소 경로에 제공한다.
async function serveAt(page, basePath) {
  await page.route(`${origin}${basePath}**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const relativePath = pathname.slice(basePath.length) || 'index.html';
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) return route.abort();

    try {
      await route.fulfill({ path: filePath, contentType: contentTypes[path.extname(filePath)] });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await route.fulfill({ status: 404, body: 'Not Found' });
    }
  });
}

async function readSelectedManifest(page) {
  return page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const response = await fetch(link.href);
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const manifest = await response.json();
    return {
      pathname: new URL(link.href).pathname,
      name: manifest.name,
      shortName: manifest.short_name,
      startUrl: new URL(manifest.start_url, link.href).pathname,
      scope: new URL(manifest.scope, link.href).pathname
    };
  });
}

const scenarios = [
  {
    label: 'dev', basePath: '/HeartTune-test/', environment: 'dev',
    installName: '오늘심박 dev', manifestName: '오늘심박 dev', manifestFile: 'manifest-dev.webmanifest'
  },
  {
    label: 'pre', basePath: '/HeartTune-test/preview/', environment: 'pre',
    installName: '오늘심박 pre', manifestName: '오늘심박 pre', manifestFile: 'manifest-pre.webmanifest'
  },
  {
    label: 'production', basePath: '/HeartTune/', environment: null,
    installName: '오늘심박', manifestName: '오늘심박 - 심박수 측정기 (HeartTune)', manifestFile: 'manifest.webmanifest'
  }
];

test.describe('환경별 이름 및 설치 메타데이터', () => {
  // 경로별 매니페스트 선택을 검증하므로 이전 실행의 서비스 워커 캐시는 사용하지 않는다.
  test.use({ serviceWorkers: 'block' });

  for (const { label, basePath, environment, installName, manifestName, manifestFile } of scenarios) {
    test(`${label}: 화면·Apple 메타·매니페스트 및 언어 전환`, async ({ page, browserName }) => {
      await serveAt(page, basePath);
      await page.goto(`${origin}${basePath}`);
      await expect(page.locator('body')).toHaveClass(/i18n-ready/);
      await expect(page.locator('.brand-title')).toHaveText('오늘심박');
      const expectedTitle = environment ? `${productionTitle} ${environment}` : productionTitle;
      await expect(page).toHaveTitle(expectedTitle);
      if (environment) await expect(page.locator('html')).toHaveAttribute('data-environment', environment);
      else await expect(page.locator('html')).not.toHaveAttribute('data-environment', /.+/);
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', installName);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', `./${manifestFile}`);

      for (const badge of ['dev', 'pre']) {
        const locator = page.locator(`.environment-${badge}`);
        if (environment === badge) await expect(locator).toBeVisible();
        else await expect(locator).toBeHidden();
      }

      const expectedManifest = {
        pathname: `${basePath}${manifestFile}`,
        name: manifestName,
        shortName: installName,
        startUrl: `${basePath}index.html`,
        scope: basePath
      };
      expect(await readSelectedManifest(page)).toEqual(expectedManifest);
      if (browserName === 'chromium') {
        // 브라우저가 실제 설치 메타데이터로 선택한 매니페스트도 확인한다.
        const cdp = await page.context().newCDPSession(page);
        const browserManifest = await cdp.send('Page.getAppManifest');
        expect(browserManifest.url).toBe(`${origin}${basePath}${manifestFile}`);
        const parsedManifest = JSON.parse(browserManifest.data);
        expect(parsedManifest.name).toBe(manifestName);
        expect(parsedManifest.short_name).toBe(installName);
        await cdp.detach();
      }

      await page.locator('#btnLangToggle').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('.brand-title')).toHaveText('HeartTune');
      if (environment) await expect(page.locator(`.environment-${environment}`)).toBeVisible();
      await expect(page).toHaveTitle(expectedTitle);
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', installName);
      expect(await readSelectedManifest(page)).toEqual(expectedManifest);

      // 직접 index.html로 접속해도 경로 구분과 언어 설정이 유지된다.
      await page.goto(`${origin}${basePath}index.html`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('.brand-title')).toHaveText('HeartTune');
      await expect(page).toHaveTitle(expectedTitle);
      if (environment) await expect(page.locator(`.environment-${environment}`)).toBeVisible();
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', installName);
      expect(await readSelectedManifest(page)).toEqual(expectedManifest);
    });
  }
});
