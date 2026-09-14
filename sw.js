/**
 * Service Worker — 오프라인 동작
 *
 * ⚠️ GitHub Pages는 https://<계정>.github.io/HeartTune-test/ 처럼
 *    **하위 경로**로 배포된다. 따라서:
 *    - 캐시 키를 절대경로('/index.html')로 쓰면 다른 경로와 충돌한다
 *    - 등록도 './sw.js' 상대경로로 해야 404가 안 난다
 *    (등록 코드는 src/main.js 참고)
 *
 * 전략: 정적 자원은 cache-first, 문서는 network-first(실패 시 캐시).
 * 카메라는 로컬 API이므로 인터넷 없이도 측정이 동작한다.
 */

const CACHE = 'hearttune-v3';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/camera.js',
  './src/dsp.js',
  './src/storage.js',
  './src/share.js',
  './src/i18n/index.js',
  './src/i18n/ko.json',
  './src/i18n/en.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      // 개별 실패가 전체 설치를 막지 않게 방어
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 문서는 network-first — 배포 즉시 반영되어야 한다
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // 그 외 정적 자원은 cache-first
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
    ),
  );
});
