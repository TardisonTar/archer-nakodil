"use strict";
(() => {
  const script=document.currentScript;const root=script?new URL('../../',script.src):new URL('/',location.href);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const typeNames={game:'GAME',website:'WEB','3d':'3D',tool:'TOOL',experiment:'EXPERIMENT'};
  let projects=[],statuses={};
  const statusBadge=p=>`<span class="badge status-badge" data-status="${esc(p.status)}">${esc(statuses[p.status]?.label||p.status)}</span>`;
  const card=p=>`<article class="project-card" data-category="${esc(p.category||p.type)}" data-status="${esc(p.status)}"><div class="project-card-media">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">`:''}</div><div class="project-card-body"><div class="badges"><span class="badge">${esc(typeNames[p.type]||p.type)}</span>${statusBadge(p)}${p.version?`<span class="badge">${esc(p.version)}</span>`:''}</div><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p><div class="button-row">${p.detailUrl?`<a class="btn btn-primary" href="${esc(p.detailUrl)}">Подробнее →</a>`:''}${p.onlineUrl?`<a class="btn" href="${esc(p.onlineUrl)}" data-project="${esc(p.slug)}">Запустить ↗</a>`:''}${p.downloadUrl?`<a class="btn" href="${esc(p.downloadUrl)}" data-project="${esc(p.slug)}" download>Скачать ↓</a>`:''}</div></div></article>`;
  const matches=(p,filter)=>filter==='all'||p.status===filter||p.category===filter||p.type===filter;
  function renderCatalog(box){
    const active=document.querySelector('[data-project-filter].active');
    const filter=active?.dataset.projectFilter||box.dataset.defaultFilter||'all';
    const list=projects.filter(p=>matches(p,filter));
    box.innerHTML=list.map(card).join('')||'<p class="muted">В этой категории пока нет проектов.</p>';
  }
  function renderAll(){document.querySelectorAll('[data-project-catalog]').forEach(renderCatalog);document.querySelectorAll('[data-project-preview]').forEach(box=>{const limit=Number(box.dataset.limit||4);const list=projects.filter(p=>!p.featured).slice(0,limit);box.innerHTML=list.map(card).join('');});document.querySelectorAll('[data-project-count]').forEach(el=>el.textContent=String(projects.length).padStart(2,'0'));}
  async function init(){
    if(!document.querySelector('[data-project-catalog],[data-project-preview],[data-project-count]'))return;
    try{
      const [pr,sr]=await Promise.all([fetch(new URL('data/projects.json',root),{cache:'no-store'}),fetch(new URL('data/statuses.json',root),{cache:'no-store'})]);
      if(!pr.ok||!sr.ok)throw new Error('catalog');projects=(await pr.json()).projects||[];(await sr.json()).statuses.forEach(x=>statuses[x.id]=x);renderAll();
      document.querySelectorAll('[data-project-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-project-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderAll();}));
    }catch{document.querySelectorAll('[data-project-catalog],[data-project-preview]').forEach(box=>box.innerHTML='<p class="muted">Каталог временно недоступен.</p>');}
  }
  void init();
})();
