"use strict";
(() => {
  const toggle=document.querySelector('[data-nav-toggle]');
  const nav=document.querySelector('[data-nav]');
  if(toggle&&nav){
    const close=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false')};
    toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open))});
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  }
  document.querySelectorAll('[data-year]').forEach(el=>el.textContent=String(new Date().getFullYear()));
})();
