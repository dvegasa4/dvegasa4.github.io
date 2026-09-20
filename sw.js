const CACHE = "puzzles-shell-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/main.js",
  "./js/ui.js",
  "./js/audio.js",
  "./js/storage/db.js",
  "./js/puzzle/jigsaw.js",
  "./js/puzzle/engine.js",
  "./js/screens/home.js",
  "./js/screens/create.js",
  "./js/screens/play.js",
  "./js/screens/shop.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Network-first: пока есть сеть — всегда отдаём и кэшируем самую свежую
  // версию файла. Раньше здесь был stale-while-revalidate (сначала кэш,
  // сеть — только фоном), из-за чего любое изменение JS/CSS проявлялось
  // только со второго обновления страницы: на первом всё ещё отдавался
  // старый закэшированный код. Офлайн-доступность не страдает — при
  // обрыве сети мы всё так же падаем на кэш (а для навигаций — на
  // index.html), просто сеть теперь имеет приоритет, когда она доступна.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw new Error("offline and not cached");
      }
    })()
  );
});
