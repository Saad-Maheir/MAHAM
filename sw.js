/**
 * MAHAM FinTech Platform - Service Worker (PWA Shell Cacher)
 * Offline-resilient cache management for fast mobile rendering
 */

const CACHE_NAME = 'maham-v2.2.0';
const STATIC_ASSETS = [
    './',
    './index.html',
    './assets/css/app.css',
    './assets/js/api.js',
    './assets/js/auth.js',
    './assets/js/dashboard.js',
    './assets/js/wallet.js',
    './assets/js/subscriptions.js',
    './assets/js/app.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    // Purge all legacy caches immediately
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass API calls from cache to maintain strict real-time financial integrity
    if (url.pathname.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network-First strategy: Always fetch fresh assets, fallback to cache if offline
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

