"use strict";
(() => {
  if(!('serviceWorker' in navigator)||location.protocol!=='https:'&&location.hostname!=='localhost')return;
  let deferred=null;
  navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  const button=document.createElement('button');button.type='button';button.className='pwa-install';button.textContent='Установить Archer';button.hidden=true;document.body.append(button);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;button.hidden=true;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;deferred=null;});
})();
