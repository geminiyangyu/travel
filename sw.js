/* ==========================================================================
 * sw.js — 離線快取 (Service Worker)
 * ==========================================================================
 * 目的：出國旅行時常常沒網路或網路很慢，這支程式會把手冊的網頁、樣式、
 *       程式碼與看過的照片存在手機裡，讓你在飛機上、地鐵裡、沒開漫遊的
 *       時候依然打得開手冊。
 *
 * 注意：改版後如果手機上看到的還是舊畫面，把下面的 CACHE_VERSION 數字 +1，
 *       重新上傳即可強制更新。
 * ========================================================================== */

var CACHE_VERSION = 'travel-v1';
var SHELL = [
    './',
    './index.html',
    './styles.css',
    './auth.js',
    './app.js',
    './manifest.webmanifest',
    './icon-180.png',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(function (cache) {
            // 個別加入，任何一個失敗都不要害整個安裝失敗
            return Promise.all(SHELL.map(function (url) {
                return cache.add(url).catch(function () { });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                return k === CACHE_VERSION ? null : caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    var url = new URL(req.url);
    var sameOrigin = (url.origin === self.location.origin);
    var path = url.pathname;

    // 1) 加密行程檔：優先用網路（才拿得到最新版），沒網路時退回快取
    if (sameOrigin && /\/data\/[^/]+\.json$/.test(path)) {
        event.respondWith(
            fetch(req).then(function (res) {
                var copy = res.clone();
                caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
                return res;
            }).catch(function () {
                return caches.match(req);
            })
        );
        return;
    }

    // 2) 照片：優先用快取（看過一次就存起來，之後離線也看得到）
    if (sameOrigin && /\/(assets|assetsnew)\//.test(path)) {
        event.respondWith(
            caches.match(req).then(function (hit) {
                return hit || fetch(req).then(function (res) {
                    var copy = res.clone();
                    caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
                    return res;
                });
            })
        );
        return;
    }

    // 3) 網頁本體與字型：先給快取讓它秒開，同時在背景偷偷更新
    if (sameOrigin || /fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
        event.respondWith(
            caches.match(req).then(function (hit) {
                var network = fetch(req).then(function (res) {
                    if (res && (res.ok || res.type === 'opaque')) {
                        var copy = res.clone();
                        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
                    }
                    return res;
                }).catch(function () { return hit; });
                return hit || network;
            })
        );
    }
});
