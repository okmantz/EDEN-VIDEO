// EDEN Studio service worker.
//  - Pre-caches the whole app (code, icons, fonts) so it opens and edits fully offline.
//  - Code (HTML/JS/CSS) is network-first, so a new deploy shows up on the next open; the cache is the offline fallback.
//  - Fonts, icons and images are cache-first.
const VERSION = 'eden-studio-v3';
const CORE = [
 "./",
 "assets/icons/apple-touch-icon.png",
 "assets/icons/favicon-32.png",
 "assets/icons/favicon.svg",
 "assets/icons/icon-192.png",
 "assets/icons/icon-512.png",
 "assets/icons/icon-maskable-512.png",
 "css/app.css",
 "css/fonts.css",
 "index.html",
 "js/app.js",
 "js/brand.js",
 "js/autoedit.js",
 "js/oneclick.js",
 "js/asr.js",
 "js/audio.js",
 "js/compose.js",
 "js/effects.js",
 "js/engine.js",
 "js/export.js",
 "js/generators.js",
 "js/gl.js",
 "js/media.js",
 "js/model.js",
 "js/mp4mux.js",
 "js/state.js",
 "js/synth.js",
 "js/textrender.js",
 "js/thumbs.js",
 "js/ui/icons.js",
 "js/ui/inspector.js",
 "js/ui/panels.js",
 "js/ui/preview.js",
 "js/ui/timeline.js",
 "js/util.js",
 "manifest.webmanifest"
];
const FONTS = [
 "assets/fonts/anton-latin-400-normal.woff2",
 "assets/fonts/archivo-black-latin-400-normal.woff2",
 "assets/fonts/bangers-latin-400-normal.woff2",
 "assets/fonts/bebas-neue-latin-400-normal.woff2",
 "assets/fonts/caveat-latin-700-normal.woff2",
 "assets/fonts/cinzel-latin-700-normal.woff2",
 "assets/fonts/dm-serif-display-latin-400-normal.woff2",
 "assets/fonts/inter-latin-400-normal.woff2",
 "assets/fonts/inter-latin-600-normal.woff2",
 "assets/fonts/inter-latin-700-normal.woff2",
 "assets/fonts/inter-latin-800-normal.woff2",
 "assets/fonts/lobster-latin-400-normal.woff2",
 "assets/fonts/montserrat-latin-600-normal.woff2",
 "assets/fonts/montserrat-latin-800-normal.woff2",
 "assets/fonts/orbitron-latin-700-normal.woff2",
 "assets/fonts/oswald-latin-500-normal.woff2",
 "assets/fonts/oswald-latin-700-normal.woff2",
 "assets/fonts/pacifico-latin-400-normal.woff2",
 "assets/fonts/permanent-marker-latin-400-normal.woff2",
 "assets/fonts/playfair-display-latin-700-normal.woff2",
 "assets/fonts/poppins-latin-500-normal.woff2",
 "assets/fonts/poppins-latin-700-normal.woff2",
 "assets/fonts/righteous-latin-400-normal.woff2",
 "assets/fonts/space-grotesk-latin-600-normal.woff2"
];
const NET_TIMEOUT = 5000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Individually, so one missing file never blocks the install.
    await Promise.all([...CORE, ...FONTS].map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('eden-studio-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isCode = (url) => /\.(?:js|css|html|webmanifest|json)$/.test(url.pathname) || url.pathname.endsWith('/');

async function networkFirst(req, cache) {
  try {
    const res = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NET_TIMEOUT))]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cache) {
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.mode === 'navigate') {
      try { return await networkFirst(req, cache); }
      catch { return (await cache.match('index.html')) || (await cache.match('./')) || Response.error(); }
    }
    return isCode(url) ? networkFirst(req, cache) : cacheFirst(req, cache);
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
