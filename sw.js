// System Quest — Service Worker (fully automatic — no manual steps)
//
// You never need to edit this file when you ship a game update. There is
// no version number anywhere. Here's how it all works:
//
//   - Pages (index.html, about.html, guide.html, etc.) always try the
//     network FIRST, so the page itself is always the newest copy. The
//     cached copy is only used as a fallback if the player is offline.
//
//   - Every time a page is fetched fresh from the network, this worker
//     compares the new bytes against whatever was cached from last time.
//     If they differ, that means you genuinely shipped a change — so it
//     tells the open app to show a simple "this game was updated" notice,
//     with zero input from you. If nothing changed, nothing is shown.
//
//   - Everything else (icons, manifest.json, images) uses a
//     "stale-while-revalidate" strategy: the player instantly gets
//     whatever's cached (fast load), and a fresh copy is fetched in the
//     background and saved for next time.
//
// Just edit your game files and upload/commit as usual. That's the whole
// workflow now — nothing else to remember.

const CACHE_NAME = 'system-quest-cache';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function notifyClientsOfUpdate(){
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clientsList.forEach((c) => c.postMessage({ type: 'SYSTEM_QUEST_UPDATED' }));
}

async function handleHtmlRequest(req, event){
  let networkRes;
  try {
    networkRes = await fetch(req);
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }

  const cache = await caches.open(CACHE_NAME);
  // Read whatever was cached from the PREVIOUS visit before we overwrite it,
  // so there's something to compare the new content against.
  const oldCached = await cache.match(req);
  const resForCache = networkRes.clone();
  const resForDiff = networkRes.clone();

  // Do the cache write + diff/notify in the background so the page itself
  // isn't delayed waiting on it.
  event.waitUntil((async () => {
    await cache.put(req, resForCache);
    if (oldCached) {
      const [oldText, newText] = await Promise.all([oldCached.text(), resForDiff.text()]);
      if (oldText !== newText) {
        await notifyClientsOfUpdate();
      }
    }
    // If oldCached is missing, this is the first time this file's ever been
    // seen (fresh install) — nothing to compare against, so stay silent.
  })());

  return networkRes;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const acceptsHtml = (req.headers.get('accept') || '').includes('text/html');
  const isHtml = req.mode === 'navigate' || acceptsHtml;

  if (isHtml) {
    event.respondWith(handleHtmlRequest(req, event));
    return;
  }

  // Stale-while-revalidate for everything else.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
