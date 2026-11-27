// EDEN Studio service worker: offline app shell + stale-while-revalidate for same-origin assets.
const VERSION = 'eden-studio-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/fonts.css',
  'js/app.js', 'js/util.js', 'js/effects.js', 'js/generators.js', 'js/gl.js', 'js/textrender.js', 'js/model.js', 'js/compose.js', 'js/synth.js', 'js/audio.js',
  'js/media.js', 'js/engine.js', 'js/state.js', 'js/export.js', 'js/mp4mux.js', 'js/thumbs.js', 'js/ui/icons.js', 'js/ui/panels.js', 'js/ui/inspector.js', 'js/ui/timeline.js', 'js/ui/preview.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
