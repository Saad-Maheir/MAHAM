/**
 * MAHAM FinTech Platform - Service Worker (Strict Network-First Strategy)
 * Cache-busting & Instant Live Updates Pipeline for Desktop & Mobile
 */

const CACHE_NAME = 'maham-fintech-v3.2.2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './admin.html',
    './assets/css/app.css?v=3.2.2',
    './assets/js/api.js?v=3.2.2',
    './assets/js/auth.js?v=3.2.2',
    './assets/js/dashboard.js?v=3.2.2',
    './assets/js/wallet.js?v=3.2.2',
    './assets/js/subscriptions.js?v=3.2.2',
    './assets/js/app.js?v=3.2.2',
    './assets/js/admin.js?v=3.2.2',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    // Force immediate activation without waiting
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Purge all legacy caches immediately and take control of all clients
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

    // 1. Strictly bypass API calls from cache to maintain absolute real-time data
    if (url.pathname.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. Strict Network-First strategy: Always request live server assets first
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
                // Offline fallback to cache only when network fails
                return caches.match(event.request);
            })
    );
});

