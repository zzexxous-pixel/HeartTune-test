/**
 * scripts/serve.js
 * 오늘심박 (HeartTune) — 의존성 없는 정적 파일 서버 (로컬 확인 / Playwright E2E 용)
 *
 * 외부 패키지를 내려받지 않도록 Node 표준 모듈만 사용한다.
 *   실행: node scripts/serve.js [port] [rootDir]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const positionals = args.filter((arg) => !arg.startsWith('--'));
const NO_SW = args.includes('--no-sw');
const PORT = Number(positionals[0] || process.env.PORT || 8080);
const ROOT = path.resolve(positionals[1] || path.join(__dirname, '..'));
const NO_SW_SCRIPT = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', () => {});`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  if (NO_SW && pathname.endsWith('/sw.js')) {
    send(res, 200, NO_SW_SCRIPT, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-store'
    });
    return;
  }

  const filePath = path.join(ROOT, pathname);

  // 경로 탈출(directory traversal) 차단
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[serve] http://localhost:${PORT}  (root: ${ROOT}${NO_SW ? ', no-sw' : ''})`);
});
