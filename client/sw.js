// ============================================
//   Service Worker — PWA Offline Support
//   Zack Exam
// ============================================

const CACHE_NAME = 'quiz-platform-v40';
const STATIC_ASSETS = [
    '/css/styles.min.css',
    '/css/tailwind.min.css',
    '/css/dark-fixes.min.css',
    '/css/icons.min.css',
    '/js/bootstrap.min.js',
    '/js/app.admin.bundle.min.js',
    '/js/app.features.bundle.min.js',
    '/manifest.json',
    '/icons/bg.webp',
    '/fonts/Cairo-Regular.woff2',
    '/fonts/Cairo-Bold.woff2',
    '/fonts/Amiri-Regular.woff2',
    '/fonts/fa-solid-900.woff2',
    '/fonts/fa-brands-400.woff2'
];

// Install — cache static assets only (CDN loaded by browser directly)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch — only handle same-origin GET requests
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle http/https from our own origin
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // API calls — Network Only
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(JSON.stringify({ error: 'أنت غير متصل بالإنترنت.' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // JS & HTML files — Network First (ensures fresh code after deployments)
    if ((url.pathname.endsWith('.js') && !url.pathname.endsWith('sw.js')) || url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(request).then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }).catch(() => caches.match(request).then(cached => cached || new Response('', { status: 408 })))
        );
        return;
    }

    // Static assets — Stale While Revalidate
    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request).then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached || new Response('', { status: 408 }));

            return cached || networkFetch;
        })
    );
});
