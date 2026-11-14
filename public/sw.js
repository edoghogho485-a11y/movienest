// MovieNest service worker.
// Deliberately minimal: it lets the browser offer "Install app" but does NOT
// cache anything, so rooms, chat and sync always use live data and updates
// from GitHub/Vercel show up immediately.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
