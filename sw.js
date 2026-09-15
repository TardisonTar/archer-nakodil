"use strict";
const CACHE='archer-nakodil-v2.0';
const SHELL=[
  '/', '/offline.html','/manifest.webmanifest',
  '/assets/css/tokens.css','/assets/css/layout.css','/assets/css/components.css','/assets/css/pages.css','/assets/css/brand.css',
  '/assets/js/site.js','/assets/js/releases.js','/assets/js/updates.js','/assets/js/pwa.js',
  '/assets/icons/favicon.svg','/assets/icons/pwa-192.png','/assets/icons/pwa-512.png',
  '/games/','/projects/','/updates/','/downloads/','/about/',
  '/games/morskoy-boy/','/games/morskoy-boy/play/','/games/tetris/','/projects/dom-svistka-3d/','/projects/crec/','/games/pixel-platformer/',
  '/games/morskoy-boy/play/assets/app.css','/games/morskoy-boy/play/assets/app.js','/games/morskoy-boy/play/assets/game-core.js','/games/morskoy-boy/play/assets/history.js','/games/morskoy-boy/play/assets/lan-client.js','/games/morskoy-boy/play/assets/renderer.js'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  const accept=req.headers.get('accept')||'';
  if(accept.includes('text/html')||url.pathname.endsWith('.json')||url.pathname.endsWith('.xml')){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>caches.match(req).then(r=>r||caches.match('/offline.html'))));return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;})));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
