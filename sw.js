/**
 * sw.js
 * 오늘심박 (HeartTune) — 오프라인 동작 보장 Service Worker
 *
 * · 모든 경로는 상대경로(GitHub Pages 하위 경로 /HeartTune/ 호환)
 * · CACHE_NAME 은 빌드 시 내용 해시로 자동 교체됩니다(scripts/build-dist.js).
 *   → 배포할 때마다 캐시가 자동으로 새 이름을 갖고, activate 에서 옛 캐시를 삭제합니다.
 *   → 캐시 버전을 사람이 수동으로 올릴 필요가 없습니다.
 * · 화면(HTML)은 네트워크 우선, 실패 시 캐시 폴백 → 새 배포가 즉시 반영됩니다.
 */
const CACHE_NAME = 'hearttune-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/main.css',
  './src/main.js',
  './src/dsp.js',
  './src/i18n.js',
  './src/features/camera.js',
  './src/features/result-indicators.js',
  './src/features/sheets.js',
  './src/features/share.js',
  './src/features/storage.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return response;
  const cloned = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 화면 문서는 항상 최신을 시도하고, 오프라인일 때만 캐시를 사용한다.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 정적 자산은 캐시 우선 (파일명이 고정이므로 캐시 이름이 바뀌면 자동 갱신됨)
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => putInCache(request, response))
    )
  );
});
