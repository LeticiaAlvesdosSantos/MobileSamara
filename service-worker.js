const CACHE_NAME = 'samara-agenda-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/login.html',
    '/cadastro.html',
    '/dashboard.html',
    '/pacientes.html',
    '/agendamento.html',
    '/registro-sessao.html',
    '/lembrete.html',
    '/perfil.html',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request);
                })
        );
    } else {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request);
                })
        );
    }
});

self.addEventListener('sync', event => {
    if (event.tag === 'sync-consultas') {
        event.waitUntil(syncConsultas());
    }
});

self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200]
    };
    
    event.waitUntil(
        self.registration.showNotification('SamaraAgenda', options)
    );
});

function syncConsultas() {
    return Promise.resolve();
}