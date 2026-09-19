'use strict';
const VERSION='20260918.10';
const STATIC_CACHE=`crec-static-${VERSION}`;
const RUNTIME_CACHE=`crec-runtime-${VERSION}`;
const APP_SHELL=[
  './','index.html','css/styles.css?v='+VERSION,'css/crec-theme.css?v='+VERSION,'css/crec-quantity.css?v='+VERSION,'css/crec-ui-fixes.css?v='+VERSION,'css/crec-magnifier.css?v='+VERSION,'js/crec-theme.js?v='+VERSION,'js/crec-magnifier.js?v='+VERSION,'js/app.js?v='+VERSION,'js/logo-animation.js?v='+VERSION,'js/catalog-worker.js?v='+VERSION,
  'data/catalog-meta.json?v='+VERSION,'manifest.json','icon-192.png','icon-512.png',
  'images/logo/logo-atlas-3b5e84d906.webp','images/catalog/placeholder-logo.png',
  'images/locations/volzhski.jpg','images/locations/menzhinskogo.jpg','images/locations/7gvard.jpg'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.endsWith(VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
async function cacheFirst(request){const cached=await caches.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)(await caches.open(RUNTIME_CACHE)).put(request,response.clone());return response;}
async function staleWhileRevalidate(request){const cache=await caches.open(RUNTIME_CACHE);const cached=await caches.match(request);const network=fetch(request).then(response=>{if(response.ok)cache.put(request,response.clone());return response;}).catch(()=>null);return cached||await network||Response.error();}
async function networkFirst(request){const cache=await caches.open(RUNTIME_CACHE);try{const response=await fetch(request);if(response.ok)cache.put(request,response.clone());return response;}catch{const cached=await caches.match(request);return cached||caches.match('index.html');}}
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){event.respondWith(networkFirst(request));return;}
  if(url.pathname.includes('/images/catalog/')||request.destination==='image'){event.respondWith(cacheFirst(request));return;}
  if(url.pathname.includes('/data/catalog/')){event.respondWith(staleWhileRevalidate(request));return;}
  event.respondWith(staleWhileRevalidate(request));
});
