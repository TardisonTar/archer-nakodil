"use strict";
(() => {
  const API='https://api.archer-nakodil.ru/v1/event';
  const CURRENT_PROJECT=window.ARCHER_PROJECT||'';
  const send=(event,extra={})=>{
    const payload={event,path:location.pathname,...extra};
    const body=JSON.stringify(payload);
    try{
      if(navigator.sendBeacon){navigator.sendBeacon(API,new Blob([body],{type:'application/json'}));return;}
      fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body,mode:'cors',keepalive:true}).catch(()=>{});
    }catch{}
  };
  send('page_view',{project:CURRENT_PROJECT});
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');if(!a)return;
    const href=a.getAttribute('href')||'';
    const project=a.dataset.project||CURRENT_PROJECT||(/morskoy-boy/.test(href)?'morskoy-boy':'');
    if(/\.zip(?:$|[?#])/.test(href))send('download',{project});
    else if(/\/play\/?(?:$|[?#])/.test(href))send('project_open',{project});
    else if(/^https?:\/\//.test(href)&&!href.includes(location.hostname))send('outbound',{project});
  },{capture:true});
  window.addEventListener('appinstalled',()=>send('pwa_install'));
})();
