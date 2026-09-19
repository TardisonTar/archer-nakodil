'use strict';

const paths = {
  pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone:'<path d="m5 3 4 1 1 5-3 2a15 15 0 0 0 6 6l2-3 5 1 1 4c0 2-2 3-4 2A24 24 0 0 1 3 7c-1-2 0-4 2-4Z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3 6 9 7 9-7"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 7 0 0 1 18 0v3Z"/>',
  'file-check':'<path d="M14 2H5v20h9M14 2l5 5v5M14 2v5h5M8 7h3M8 11h6M8 15h3"/><path d="m17 15 4 2v3l-4 3-4-3v-3Z"/>',
  cart:'<path d="M2 3h3l3 13h11l3-10H6M8 16l-1 3h13"/><circle cx="9" cy="22" r="1"/><circle cx="19" cy="22" r="1"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-left':'<path d="M20 12H4m6-6-6 6 6 6"/>',
  headphones:'<path d="M3 14v-3a9 9 0 0 1 18 0v3M21 18v1c0 3-4 3-6 3"/><rect x="2" y="12" width="4" height="7" rx="2"/><rect x="18" y="12" width="4" height="7" rx="2"/>',
  box:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 4 2m10 0 4-2M12 22v-4M12 2v4"/><path d="m12 7 5 3v5l-5 3-5-3v-5Z"/>',
  truck:'<path d="M1 4h13v14H7M3 18H1V4m13 5h5l4 6v3h-3m-6 0h1"/><circle cx="5" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/>',
  shield:'<path d="M12 2c3 2 6 3 9 3v7c0 5-5 9-9 11-4-2-9-6-9-11V5c3 0 6-1 9-3Z"/><path d="m8 12 3 3 5-6"/>',
  file:'<path d="M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 12h8M8 16h8"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  heart:'<path class="heart-icon" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-9.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  compare:'<path d="M3 20h18M5 20v-7h3v7m2 0V8h3v12m2 0V3h3v17"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.box}</svg>`;
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value) + ' ₽';
const PLACEHOLDER_IMAGE='images/catalog/placeholder-logo.png';
const isPlaceholder=p=>p?.image===PLACEHOLDER_IMAGE;
const imageCaption=p=>isPlaceholder(p)?'Логотип КРЭК · Фотография товара отсутствует':`${p.name} · Артикул ${p.id}`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
const SITE_VERSION='20260918.10';
let categoryNames = {all:'Все товары'};
let categories = [];
let products = [];
const productById = new Map();
let catalogMeta = {};
let manufacturers = [];
const quickGroups = {};
const loadedRoots = new Set();
const rootLoads = new Map();
let catalogRevision=0,currentQueryKey='',currentResults=[],renderToken=0,workerSeq=0;
const workerPending=new Map();
const catalogWorker=typeof Worker!=='undefined'?new Worker(`js/catalog-worker.js?v=${SITE_VERSION}`):null;
if(catalogWorker)catalogWorker.onmessage=event=>{const msg=event.data||{};if(msg.type==='result'&&workerPending.has(msg.requestId)){workerPending.get(msg.requestId)(msg.ids||[]);workerPending.delete(msg.requestId);}};
const state = {query:'',category:'all',manufacturer:'',mode:'home',sort:'source',page:1,pageSize:24,loading:true,totalResults:0,cart:{},favorites:new Set(),compare:new Set(),slide:0};
const MAX_CART_QUANTITY=999;
function normalizeQuantity(value){
  const number=Math.trunc(Number(value));
  return Number.isFinite(number)?Math.max(1,Math.min(MAX_CART_QUANTITY,number)):1;
}
function quantityPicker(p,context='catalog'){
  const quantity=normalizeQuantity(state.cart[p.id]||1);
  const name=esc(p.name),id=esc(p.id);
  return `<div class="quantity-picker" data-quantity-picker="${id}" data-quantity-context="${context}" aria-label="Количество товара ${name}"><button type="button" data-pick-quantity="${id}" data-delta="-1" aria-label="Уменьшить количество ${name}">−</button><input type="number" min="1" max="${MAX_CART_QUANTITY}" step="1" inputmode="numeric" value="${quantity}" data-quantity-input="${id}" aria-label="Количество ${name}"><button type="button" data-pick-quantity="${id}" data-delta="1" aria-label="Увеличить количество ${name}">+</button></div>`;
}
let toastTimer;
const normalizeSearch = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');
function notify(message) { const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800); }
function categoryPath(id) { const result=[];let node=categories.find(c=>c.id===id);const seen=new Set();while(node&&!seen.has(node.id)){seen.add(node.id);result.unshift(node);node=categories.find(c=>c.id===node.parentId);}return result; }
function categorySet(id) {
  if(id==='all')return new Set(categories.map(c=>c.id));
  const result=new Set(quickGroups[id]?.roots||[id]);let changed=true;
  while(changed){changed=false;for(const c of categories){if(result.has(c.parentId)&&!result.has(c.id)){result.add(c.id);changed=true;}}}
  return result;
}
function rootCategory(id) { return quickGroups[id]?id:(categoryPath(id)[0]?.id||'all'); }
function crop(p,className='') {
  if(!p?.image)return '';
  return `<span class="catalog-photo ${className}"><img src="${esc(p.image)}" alt="${esc(isPlaceholder(p)?'Логотип КРЭК — фотография товара отсутствует':p.name)}" loading="lazy" decoding="async"></span>`;
}
function workerQuery(payload){
  if(!catalogWorker)return Promise.resolve(null);
  const requestId=++workerSeq;
  return new Promise(resolve=>{workerPending.set(requestId,resolve);catalogWorker.postMessage({...payload,type:'query',requestId});});
}
function addProducts(items,offset=null){
  const prepared=[];
  items.forEach((p,index)=>{
    const path=categoryPath(p.categoryIds?.[0]);
    const product={...p,sourceOrder:Number.isFinite(p.sourceOrder)?p.sourceOrder:(offset===null?Number.MAX_SAFE_INTEGER:offset+index),category:p.categoryIds?.[0]||'',brand:p.brand||'',description:p.description||path.map(c=>c.name).join(' / ')};
    const existing=productById.get(product.id);
    if(existing)Object.assign(existing,product);else{productById.set(product.id,product);products.push(product);}
    prepared.push(product);
  });
  if(prepared.length)catalogWorker?.postMessage({type:'add',products:prepared});
  catalogRevision++;currentQueryKey='';
}
async function loadRoot(root){
  if(!root||loadedRoots.has(root))return;
  if(rootLoads.has(root))return rootLoads.get(root);
  const shard=catalogMeta.shards?.[root];if(!shard)throw new Error(`Не найден раздел каталога ${root}`);
  const task=(async()=>{const response=await fetch(shard.file,{cache:'force-cache'});if(!response.ok)throw new Error('HTTP '+response.status+' при загрузке раздела '+root);const items=await response.json();if(!Array.isArray(items))throw new Error('Некорректный раздел каталога '+root);addProducts(items,shard.offset??0);loadedRoots.add(root);})();
  rootLoads.set(root,task);try{await task;}finally{rootLoads.delete(root);}
}
async function ensureStateData(){
  let roots=[];
  const brand=manufacturers.find(m=>m.id===state.manufacturer);
  if(brand)roots=brand.roots||[];
  else if(state.category!=='all')roots=[rootCategory(state.category)];
  else if(state.mode!=='home'||state.query)roots=catalogMeta.roots||[];
  await Promise.all([...new Set(roots)].map(loadRoot));
}
async function filteredProducts() {
  const selected=categorySet(state.category),brand=manufacturers.find(m=>m.id===state.manufacturer);
  const key=JSON.stringify([state.query,state.category,state.manufacturer,state.sort,catalogRevision]);
  if(key===currentQueryKey)return currentResults;
  let result;
  const ids=await workerQuery({query:state.query,selectedCategories:[...selected],allCategories:state.category==='all',brandProductIds:brand?[...brand.productIds]:null,sort:state.sort});
  if(ids)result=ids.map(id=>productById.get(id)).filter(Boolean);
  else{
    const words=state.query.split(/\s+/).map(normalizeSearch).filter(Boolean);
    result=products.filter(p=>(!brand||brand.productIds.has(p.id))&&(state.category==='all'||p.categoryIds.some(id=>selected.has(id)))&&words.every(word=>normalizeSearch(p.id+' '+p.name+' '+p.brand+' '+(p.aliases||[]).join(' ')+' '+p.description).includes(word)));
    if(state.sort==='source')result.sort((a,b)=>a.sourceOrder-b.sourceOrder);
    if(state.sort==='price-asc')result.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)||a.id.localeCompare(b.id));
    if(state.sort==='price-desc')result.sort((a,b)=>(b.price??-Infinity)-(a.price??-Infinity)||a.id.localeCompare(b.id));
    if(state.sort==='name')result.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  }
  currentQueryKey=key;currentResults=result;return result;
}
async function refreshCatalogView(message='Загружаем товары…'){
  const status=$('#catalog-status');status.hidden=false;status.textContent=message;$('#product-grid').setAttribute('aria-busy','true');
  try{await ensureStateData();status.hidden=true;await renderProducts();}
  catch(error){console.error(error);status.hidden=false;status.innerHTML='<p>Не удалось загрузить выбранный раздел каталога. Проверьте соединение и попробуйте ещё раз.</p><button class="button navy" data-retry-view>Повторить</button>';}
  finally{$('#product-grid').setAttribute('aria-busy','false');}
}
function renderPagination(total) {
  const el=$('#catalog-pagination');el.hidden=state.loading||total===0;
  if(state.mode==='home'){el.innerHTML=`<span>Показано ${Math.min(10,total)} из ${total.toLocaleString('ru-RU')} товаров</span><button class="button outline" data-category="all">Открыть весь каталог${icon('arrow')}</button>`;return;}
  const pages=Math.max(1,Math.ceil(total/state.pageSize));state.page=Math.min(state.page,pages);
  const numbers=[...new Set([1,state.page-1,state.page,state.page+1,pages])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
  let previous=0;
  const buttons=numbers.map(page=>{const gap=previous&&page-previous>1?'<span class="page-ellipsis">…</span>':'';previous=page;return gap+`<button data-page="${page}" ${page===state.page?'aria-current="page"':''} aria-label="Страница ${page}">${page}</button>`;}).join('');
  const first=(state.page-1)*state.pageSize+1,last=Math.min(state.page*state.pageSize,total);
  el.innerHTML=`<span>${first}–${last} из ${total.toLocaleString('ru-RU')} товаров</span>${pages>1?`<nav class="page-buttons" aria-label="Страницы каталога"><button data-page="${state.page-1}" ${state.page===1?'disabled':''} aria-label="Предыдущая страница">${icon('arrow-left')}</button>${buttons}<button data-page="${state.page+1}" ${state.page===pages?'disabled':''} aria-label="Следующая страница">${icon('arrow')}</button></nav>`:''}`;
}
async function renderProducts() {
  if(state.loading)return;
  const token=++renderToken;
  let result,total;
  if(state.mode==='home'){
    result=(catalogMeta.featuredIds||[]).map(id=>productById.get(id)).filter(Boolean);
    total=catalogMeta.totalProducts||result.length;
  }else{
    result=await filteredProducts();if(token!==renderToken)return;total=result.length;
  }
  state.totalResults=total;renderPagination(total);
  let visible;if(state.mode==='home')visible=result.slice(0,10);else visible=result.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
  const activeBrand=manufacturers.find(m=>m.id===state.manufacturer);
  $('#products-title').textContent=activeBrand?activeBrand.name:state.query?'Результаты поиска':state.category!=='all'?categoryNames[state.category]:'Каталог товаров';
  $('#result-count').hidden=false;$('#result-count').textContent=`${total.toLocaleString('ru-RU')} товаров`;
  $('#show-all').hidden=state.mode!=='home';
  $('#active-filters').hidden=!state.query&&!state.manufacturer&&state.category==='all';
  $('#active-filters').innerHTML=(state.manufacturer?`<button class="filter-chip" data-clear="manufacturer">${esc(activeBrand?.name||'Производитель')}${icon('close')}</button>`:'')+(state.query?`<button class="filter-chip" data-clear="query">${esc(state.query)}${icon('close')}</button>`:'')+(state.category!=='all'?`<button class="filter-chip" data-clear="category">${esc(categoryNames[state.category])}${icon('close')}</button>`:'');
  $('#empty-state').hidden=!!total;
  $('#product-grid').innerHTML=visible.map(p=>`<article class="product-card ${p.image?'has-image':'no-image'}">${p.image?`<button class="product-picture" data-product="${p.id}" aria-label="Подробнее о ${esc(p.name)}">${crop(p)}${p.imageRepresentative?'<span class="product-image-note">Пример исполнения</span>':''}</button>`:''}<div class="product-info"><span class="manufacturer">${esc(p.brand)}</span><button class="product-name" data-product="${p.id}">${esc(p.name)}</button><p class="product-description">${esc(p.description)}</p><span class="catalog-article">Артикул ${esc(p.id)} · ${esc(p.unit)}</span></div><div class="product-tools"><button class="icon-button ${state.compare.has(p.id)?'selected':''}" data-compare="${p.id}" aria-label="Сравнить ${esc(p.name)}" aria-pressed="${state.compare.has(p.id)}">${icon('compare')}</button><button class="icon-button ${state.favorites.has(p.id)?'selected':''}" data-favorite="${p.id}" aria-label="В избранное: ${esc(p.name)}" aria-pressed="${state.favorites.has(p.id)}">${icon('heart')}</button></div><div class="product-price-row"><span class="price">${p.price===null?'<small>По запросу</small>':money(p.price)+' / '+esc(p.unit)}</span><button class="add-cart product-card-add" data-product="${p.id}" aria-label="Открыть карточку ${esc(p.name)} и выбрать количество">${icon('cart')}<span>Добавить в корзину</span></button></div></article>`).join('');
}
function closeMenu(){ $('#catalog-menu').hidden=true;$('#catalog-toggle').setAttribute('aria-expanded','false'); }
function syncCategoryControls() {
  const root=rootCategory(state.category);$('#search-category').value=root;$('#catalog-category').value=root;
  const descendants=[...categorySet(root)].filter(id=>id!==root);
  const children=categories.filter(c=>descendants.includes(c.id));
  $('#subcategory-label').hidden=root==='all'||children.length===0;
  $('#catalog-subcategory').innerHTML='<option value="">Все подкатегории</option>'+children.map(c=>`<option value="${c.id}">${esc(categoryPath(c.id).slice(quickGroups[root]?0:1).map(n=>n.name).join(' / '))}</option>`).join('');
  $('#catalog-subcategory').value=state.category!==root?state.category:'';
}
async function selectCategory(category) {
  if(state.loading){notify('Каталог ещё загружается');return;}
  if(!Object.hasOwn(categoryNames,category))return;
  state.category=category;state.manufacturer='';state.mode='all';state.page=1;state.query='';$('#search-input').value='';syncCategoryControls();closeMenu();
  await refreshCatalogView();$('#products').scrollIntoView({behavior:'smooth',block:'start'});
}
async function searchProducts(query,category='all') {
  if(state.loading)throw new Error('Каталог ещё загружается');
  if(typeof query!=='string'||!Object.hasOwn(categoryNames,category))throw new Error('Некорректные параметры поиска');
  state.query=query.trim();state.category=category;state.manufacturer='';state.mode='all';state.page=1;$('#search-input').value=state.query;syncCategoryControls();closeMenu();
  await refreshCatalogView('Выполняем поиск…');$('#products').scrollIntoView({behavior:'smooth',block:'start'});
}
async function loadCatalog() {
  state.loading=true;$('#catalog-status').hidden=false;$('#catalog-status').textContent='Загружаем каталог…';$('#product-grid').setAttribute('aria-busy','true');
  try {
    const response=await fetch(`data/catalog-meta.json?v=${SITE_VERSION}`,{cache:'no-cache'});if(!response.ok)throw new Error('HTTP '+response.status+' при загрузке каталога');const data=await response.json();
    if(!Array.isArray(data.featuredProducts)||!Array.isArray(data.categories)||!data.totalProducts)throw new Error('Catalog metadata is empty');
    catalogMeta=data;categories=data.categories;categoryNames={all:'Все товары',...Object.fromEntries(categories.map(c=>[c.id,c.name])),...Object.fromEntries(Object.entries(quickGroups).map(([id,g])=>[id,g.name]))};
    products.length=0;productById.clear();loadedRoots.clear();rootLoads.clear();catalogRevision=0;currentQueryKey='';currentResults=[];
    manufacturers=(data.manufacturers||[]).map(m=>({...m,productIds:new Set(m.productIds||[])}));
    addProducts(data.featuredProducts);
    const roots=categories.filter(c=>!c.parentId);const options='<option value="all">Все категории</option>'+roots.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')+'<optgroup label="Быстрый выбор">'+Object.entries(quickGroups).map(([id,g])=>`<option value="${id}">${esc(g.name)}</option>`).join('')+'</optgroup>';
    $('#search-category').innerHTML=options;$('#catalog-category').innerHTML=options;
    $('#catalog-menu').innerHTML='<button data-category="all">Все товары'+icon('arrow')+'</button>'+roots.map(c=>`<button data-category="${c.id}">${esc(c.name)}</button>`).join('');
    const priceDate=(data.priceDate||'').split('-').reverse().join('.');$('#catalog-source-note').textContent=`Каталог от ${priceDate} · ${Number(data.totalProducts).toLocaleString('ru-RU')} товаров. Цены указаны за единицу измерения.`;
    renderHotPositions();
    state.loading=false;$('#catalog-status').hidden=true;$('#product-grid').setAttribute('aria-busy','false');syncCategoryControls();await renderProducts();
  } catch(error) {
    console.error(error);$('#catalog-status').innerHTML='<p>Не удалось загрузить каталог. Проверьте соединение и попробуйте ещё раз.</p><button class="button navy" data-retry-catalog>Повторить загрузку</button>';
    $('#product-grid').setAttribute('aria-busy','false');
  }
}
function updateCartHeader() { const entries=Object.entries(state.cart); $('#cart-count').textContent=entries.reduce((n,[,qty])=>n+qty,0);$('#cart-total').textContent=money(entries.reduce((n,[id,qty])=>n+(products.find(p=>p.id===id).price||0)*qty,0)); }
function setCartQuantity(id,quantity=1) { const p=products.find(p=>p.id===id);if(!p)throw new Error('Некорректный товар');const normalized=normalizeQuantity(quantity);state.cart[id]=normalized;updateCartHeader();renderProducts();notify(`${p.name}: ${normalized} ${p.unit} в корзине`);return {id,quantity:normalized}; }
function openPanel(title,content,kind='info') { const panel=$('#panel');panel.dataset.kind=kind;$('#panel-title').textContent=title;$('#panel-content').innerHTML=content;if(!panel.open)panel.showModal();hydrateIcons(panel); }
function closePanel() { $('#panel').close(); }
const locations = [
  {
    "id": "samodelkin",
    "name": "Магазин «Самоделкин»",
    "city": "Волжский",
    "address": "ул. Мира, 30а",
    "district": "",
    "phone": null,
    "map": "volzhski.jpg",
    "width": 604,
    "height": 354
  },
  {
    "id": "prestige",
    "name": "Магазин «Престиж»",
    "city": "Волгоград",
    "address": "ул. Менжинского, 11а",
    "district": "Спартановка",
    "phone": "+7 (8442) 79-40-40",
    "map": "menzhinskogo.jpg",
    "width": 520,
    "height": 400
  },
  {
    "id": "gamma",
    "name": "ТЦ «Гамма»",
    "city": "Волгоград",
    "address": "ул. 7-я Гвардейская, 4а",
    "district": "",
    "phone": "+7 (8442) 23-95-34",
    "map": "7gvard.jpg",
    "width": 504,
    "height": 372
  }
];
const contactsSource = 'http://crec.ru/index.php?id=9';
function contactMarkup() { return `<a class="contact-link" href="tel:+78443588888">${icon('phone')}+7 (8443) 58-88-88</a><a class="contact-link" href="tel:+78443586060">${icon('phone')}+7 (8443) 58-60-60</a><a class="contact-link" href="mailto:crec@crec.ru">${icon('mail')}crec@crec.ru</a>`; }
function showLocations() {
  openPanel('Магазины и контакты',`<p class="locations-intro">Торговые точки в Волжском и Волгограде, где представлена продукция компании.</p><div class="locations-list">${locations.map((shop,index)=>`<article class="store-card"><div class="store-marker" aria-hidden="true">${icon('pin')}</div><div class="store-content"><span class="store-city">${esc(shop.city)}${shop.district?' · '+esc(shop.district):''}</span><h3>${esc(shop.name)}</h3><address>${esc(shop.address)}</address>${shop.phone?`<a class="store-phone" href="tel:${shop.phone.replace(/[^+0-9]/g,'')}">${icon('phone')}${esc(shop.phone)}</a>`:''}<details class="store-directions"><summary>Схема проезда${icon('chevron')}</summary><img src="${esc('images/locations/'+shop.map)}" width="${shop.width}" height="${shop.height}" alt="Схема проезда: ${esc(shop.name)}, ${esc(shop.city)}, ${esc(shop.address)}" loading="lazy"></details></div></article>`).join('')}</div><section class="company-contacts" aria-labelledby="company-contacts-title"><div><h3 id="company-contacts-title">Связаться с компанией</h3><p>ООО «КРЕК»</p></div><div class="company-contact-links">${contactMarkup()}</div></section><div class="locations-source"><p>Перед поездкой уточните режим работы по телефону.</p><a href="${contactsSource}" target="_blank" rel="noopener noreferrer">Контакты на crec.ru${icon('arrow')}</a></div>`,'locations');
}
const info = {
  about:['ООО «КРЕК»','Компания радиоэлектронных компонентов — сеть магазинов в Волгоградской области.','На исходном сайте представлены разделы о компании, каталоге товаров, статьях, новостях и вопросах. Сведения перенесены из доступной поисковой копии crec.ru.'],
  delivery:['Оплата и доставка','Условия оплаты и доставки из первоисточника пока не получены. Уточните их у компании по указанным телефонам.'],
  contacts:['Контакты ООО «КРЕК»','Три торговые точки в Волжском и Волгограде.'],
  support:['Связаться с компанией','Подготовьте артикул и ваш вопрос. Запрос можно передать по телефону или отправить на crec@crec.ru.'],
  engineers:['Инженерам','Техническая документация из первоисточника пока не перенесена. Наличие описаний и характеристик нужных компонентов уточните у компании.'],
  analogs:['Подбор аналогов','Укажите исходный артикул и необходимые параметры в запросе. Возможность подбора замены уточните у компании.'],
  offers:['Акции','Данные об акциях и специальных ценах из первоисточника пока не получены. Уточните действующие предложения у компании.'],
  account:['Личный кабинет','Личный кабинет пока не подключён. Для связи с компанией доступны телефоны из первоисточника.'],
  source:['О данных этой версии','Название компании, описание и контакты сохранены из ранней версии сайта.','В каталоге — 8 098 товаров и 536 разделов. Артикулы, наименования, цены и единицы измерения перенесены из предоставленного каталога от 14.09.2026. Для 4 058 товаров добавлены фотографии из предоставленного архива.','Применены последние изменения интерфейса: четыре слайда, лента категорий «Горячие позиции» и список производителей по названиям товаров и разделов каталога.']
};
function showManufacturers() {
  if(state.loading){notify('Каталог ещё загружается');return;}
  openPanel('Производители',`<p class="brands-intro">Производители и торговые марки, указанные в каталоге. Выберите марку, чтобы открыть её товары.</p><div class="brand-list">${manufacturers.map(brand=>`<button data-brand="${brand.id}"><strong>${esc(brand.name)}</strong><span>${Number(brand.count||brand.productIds.size).toLocaleString('ru-RU')} товаров ${icon('arrow')}</span></button>`).join('')}</div>`,'brands');
}
async function selectManufacturer(id) {
  if(!manufacturers.some(brand=>brand.id===id))return;
  state.manufacturer=id;state.query='';state.category='all';state.mode='all';state.page=1;
  $('#search-input').value='';syncCategoryControls();closePanel();closeMenu();await refreshCatalogView();
  $('#products').scrollIntoView({behavior:'smooth',block:'start'});
}
function openInfo(key) {
  if(key==='locations'||key==='contacts'){showLocations();return;}
  if(key==='brands'){showManufacturers();return;}
  const content=info[key];if(!content)return;openPanel(content[0],content.slice(1).map(t=>`<p>${esc(t)}</p>`).join('')+contactMarkup()+(key!=='account'?'<button class="button navy" data-quote>Запросить КП</button>':''));
}
function productGallery(p) {
  if(!p.image)return '';
  return `<div class="demo-gallery">${crop(p,'detail-visual')}</div><p class="photo-caption">${esc(imageCaption(p))}</p>`;
}
function showProduct(id) {
  const p=products.find(p=>p.id===id);if(!p)return;
  openPanel(p.name,`${productGallery(p)}<div class="detail-brand">${esc(p.brand)}</div><p>${esc(p.description)}</p>${p.aliases?.length?`<p class="muted">В печатном прайсе: ${esc(p.aliases.join('; '))}</p>`:''}<div class="detail-price">${p.price===null?'Цена по запросу':money(p.price)+' / '+esc(p.unit)}</div><p class="muted">Артикул ${esc(p.id)}. Цена за ${esc(p.unit)} по каталогу от 14.09.2026. Наличие уточняйте у компании.</p><div class="detail-actions"><div class="detail-add-group">${quantityPicker(p,'detail')}<button class="button red ${state.cart[p.id]?'added':''}" data-add="${p.id}">${icon(state.cart[p.id]?'check':'cart')}${state.cart[p.id]?'Обновить корзину':'В корзину'}</button></div><button class="button outline" data-quote-product="${p.id}">Запросить КП</button></div>`,'product');
}
function showCart() {
  const entries=Object.entries(state.cart);
  if(!entries.length){openPanel('Корзина',`<div class="cart-empty">${icon('cart')}<h3>Ваша корзина пока пуста</h3><p>Выберите компоненты из каталога,<br>чтобы подготовить запрос.</p><button class="button navy" data-cart-catalog>Перейти в каталог</button></div>`,'cart');return;}
  const total=entries.reduce((n,[id,qty])=>n+(products.find(p=>p.id===id).price||0)*qty,0);
  openPanel(`Корзина · ${entries.reduce((n,[,qty])=>n+qty,0)}`,`<div class="cart-list">${entries.map(([id,qty])=>{const p=products.find(p=>p.id===id);return `<div class="cart-row">${crop(p)}<div><h3>${esc(p.name)}</h3><p class="muted">Артикул ${esc(p.id)}</p><div class="cart-row-tools"><div class="quantity"><button data-quantity="${id}" data-delta="-1" aria-label="Уменьшить количество ${esc(p.name)}">−</button><input class="cart-quantity-input" type="number" min="1" max="${MAX_CART_QUANTITY}" step="1" inputmode="numeric" value="${qty}" data-cart-quantity="${id}" aria-label="Количество ${esc(p.name)}"><span class="quantity-unit">${esc(p.unit)}</span><button data-quantity="${id}" data-delta="1" aria-label="Увеличить количество ${esc(p.name)}">+</button></div><button class="icon-button" data-remove="${id}" aria-label="Удалить ${esc(p.name)}">${icon('trash')}</button></div></div><span class="cart-row-price">${p.price===null?'По запросу':money(p.price*qty)}</span></div>`;}).join('')}</div><div class="cart-bottom"><span>Сумма</span><span>${money(total)}</span></div><p class="muted cart-disclaimer">${entries.some(([id])=>products.find(p=>p.id===id).price===null)?'Позиции «По запросу» не включены в сумму. ':''}Сумма рассчитана по каталогу от 14.09.2026. Это запрос на уточнение цен и наличия, а не оформление покупки.</p><button class="button red" data-quote>Запросить КП${icon('arrow')}</button>`,'cart');
}
function quoteLines(id) { if(id){const p=products.find(p=>p.id===id);return p?`${p.id}: ${p.name} — 1 ${p.unit}`:'';}return Object.entries(state.cart).map(([key,qty])=>`${key}: ${products.find(p=>p.id===key).name} — ${qty} ${products.find(p=>p.id===key).unit}`).join('\n'); }
function openQuote(id) {
  openPanel('Запросить коммерческое предложение',`<form class="quote-form" id="quote-form"><p>Укажите нужные компоненты. Подготовленный запрос можно скопировать или открыть в почтовом приложении для отправки на crec@crec.ru.</p><label>Ваше имя<input name="name" required autocomplete="name" placeholder="Как к вам обращаться"></label><label>Компания<input name="company" autocomplete="organization" placeholder="Название организации"></label><label>Электронная почта<input name="email" type="email" required autocomplete="email" placeholder="name@company.ru"></label><label>Артикулы, количество и комментарий<textarea name="items" required placeholder="Укажите артикул, наименование и количество">${esc(quoteLines(id))}</textarea></label><button class="button red" type="submit">Подготовить запрос${icon('file')}</button><p class="muted">Получатель: crec@crec.ru. Подготовка запроса не отправляет данные и не оформляет заказ.</p></form>`,'quote');
}
function showCompare() {
  const list=products.filter(p=>state.compare.has(p.id));
  if(!list.length)return;
  openPanel('Сравнение компонентов',`${list.length<2?'<p style="margin-bottom:16px">Добавьте ещё один компонент кнопкой сравнения в каталоге.</p>':''}<p class="muted">Цены по каталогу от 14.09.2026. Наличие уточняйте у компании.</p><div style="overflow-x:auto"><table class="compare-table"><thead><tr><th>Параметр</th>${list.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody><tr><th>Артикул</th>${list.map(p=>`<td>${esc(p.id)}</td>`).join('')}</tr><tr><th>Категория</th>${list.map(p=>`<td>${esc(p.description)}</td>`).join('')}</tr><tr><th>Цена</th>${list.map(p=>`<td>${p.price===null?'По запросу':money(p.price)+' / '+esc(p.unit)}</td>`).join('')}</tr><tr><th></th>${list.map(p=>`<td><button class="icon-button" data-compare-remove="${p.id}" aria-label="Удалить из сравнения ${esc(p.name)}">${icon('trash')}</button></td>`).join('')}</tr></tbody></table></div>`,'compare');
}
const slides = [
  {title:'Надёжные компоненты<br>для сложных задач<br>сегодня и завтра',description:'ООО «КРЕК» — сеть магазинов<br>радиоэлектронных компонентов<br>в Волгоградской области.'},
  {title:'От идеи до устройства.<br>Компоненты для<br>ваших разработок',description:'Кабели, разъёмы, приборы и инструменты.<br>Ищите товары по артикулу, названию или категории.<br>Нужные позиции можно добавить в запрос.'},
  {title:'Стабильное питание<br>для надёжной работы<br>вашего оборудования',description:'Укажите требования к напряжению и мощности.<br>Уточните доступные позиции у компании.<br>Подберите компоненты в каталоге товаров.'},
  {title:'Инструменты для пайки,<br>монтажа и ремонта',description:'Паяльники, станции и монтажные инструменты.<br>Выбирайте нужные позиции в каталоге.<br>Наличие и характеристики уточняйте у компании.'}
];
function changeSlide(delta) {
  state.slide=(state.slide+delta+slides.length)%slides.length;
  $('#hero-title').innerHTML=slides[state.slide].title;$('#hero-description').innerHTML=slides[state.slide].description;
  $('#slide-counter').textContent=`${state.slide+1} / ${slides.length}`;
  document.querySelectorAll('[data-hero-slide]').forEach(slide=>{
    const active=Number(slide.dataset.heroSlide)===state.slide;
    slide.classList.toggle('is-active',active);slide.setAttribute('aria-hidden',String(!active));
  });
}
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let heroPaused=reducedMotion.matches,hotPaused=false,heroTimer,hotTimer,hotRaf=0,hotLastFrame=0,hotTranslate=0;
let hotCategories=[];
function startHeroTimer(){clearInterval(heroTimer);heroTimer=setInterval(()=>{if(!heroPaused&&!document.hidden)changeSlide(1);},5000);}
function hotCard(category,duplicate) {
  const photo=category.photos[category.index];
  return `<button class="hot-card" data-category="${esc(category.id)}" ${duplicate?'tabindex="-1"':''}><span class="hot-card-copy"><strong>${esc(category.name)}</strong><span>${category.count.toLocaleString('ru-RU')} товаров</span><b>В каталог ${icon('arrow')}</b></span><span class="hot-image" data-hot-category="${esc(category.id)}">${photo?crop(photo):icon('box')}</span></button>`;
}
function startHotBelt(){
  cancelAnimationFrame(hotRaf);hotLastFrame=0;
  const tick=timestamp=>{
    const track=$('#hot-track');
    if(!hotLastFrame)hotLastFrame=timestamp;
    const delta=Math.min(64,Math.max(0,timestamp-hotLastFrame));
    hotLastFrame=timestamp;
    if(track&&!hotPaused&&!document.hidden){
      const group=track.querySelector('.hot-group');
      const loopWidth=group?.getBoundingClientRect().width||0;
      hotTranslate+=delta*0.080;
      if(loopWidth>0&&hotTranslate>=loopWidth)hotTranslate%=loopWidth;
      track.style.setProperty('transform',`translate3d(${-hotTranslate}px,0,0)`,'important');
    }
    hotRaf=requestAnimationFrame(tick);
  };
  hotRaf=requestAnimationFrame(tick);
}
function renderHotPositions(){
  hotCategories=(catalogMeta.hotCategories||[]).map(category=>({...category,index:0}));
  hotTranslate=0;
  const track=$('#hot-track');
  track.innerHTML=[false,true].map(duplicate=>`<div class="hot-group" ${duplicate?'aria-hidden="true"':''}>${hotCategories.map(category=>hotCard(category,duplicate)).join('')}</div>`).join('');
  track.style.setProperty('transform','translate3d(0,0,0)','important');
  $('#hot-status').hidden=true;
  clearInterval(hotTimer);hotTimer=setInterval(()=>{if(!hotPaused&&!document.hidden)rotateHotImages();},2000);
  syncMotionControls();
  startHotBelt();
}
function rotateHotImages(){
  for(const category of hotCategories){
    if(category.photos.length<2)continue;
    category.index=(category.index+1)%category.photos.length;
    const photo=category.photos[category.index];
    document.querySelectorAll(`[data-hot-category="${category.id}"]`).forEach(image=>{
      image.innerHTML=crop(photo);
    });
  }
}
function syncMotionControls(){
  $('#slide-pause').setAttribute('aria-pressed',String(heroPaused));
  $('#slide-pause').setAttribute('aria-label',heroPaused?'Включить смену слайдов':'Приостановить смену слайдов');
  $('#slide-pause').textContent=heroPaused?'▶':'Ⅱ';
  $('#hot-pause').setAttribute('aria-pressed',String(hotPaused));
  $('#hot-pause').textContent=hotPaused?'Продолжить движение':'Приостановить';
}

document.addEventListener('click',event=>{
  const b=event.target.closest('button');
  if(!event.target.closest('.catalog-menu-wrap'))closeMenu();
  if(!b)return;
  if(b.dataset.category)selectCategory(b.dataset.category);
  else if(b.dataset.info)openInfo(b.dataset.info);
  else if(b.hasAttribute('data-quote'))openQuote();
  else if(b.dataset.quoteProduct)openQuote(b.dataset.quoteProduct);
  else if(b.dataset.product)showProduct(b.dataset.product);
  else if(b.dataset.pickQuantity){const picker=b.closest('.quantity-picker');const input=picker?.querySelector('[data-quantity-input]');if(input)input.value=normalizeQuantity(Number(input.value)+Number(b.dataset.delta));}
  else if(b.dataset.add){const scope=b.closest('.product-card,.detail-add-group')||b.parentElement;const input=scope?.querySelector('[data-quantity-input]');setCartQuantity(b.dataset.add,input?.value||1);if($('#panel').open&&$('#panel').dataset.kind==='product'&&b.closest('#panel'))showProduct(b.dataset.add);}
  else if(b.dataset.favorite){const id=b.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);b.classList.toggle('selected',state.favorites.has(id));b.setAttribute('aria-pressed',String(state.favorites.has(id)));notify(state.favorites.has(id)?'Добавлено в избранное':'Удалено из избранного');}
  else if(b.dataset.compare){const id=b.dataset.compare;if(state.compare.has(id)){state.compare.delete(id);renderProducts();notify('Удалено из сравнения');}else{if(state.compare.size>=3){notify('Можно сравнить до трёх компонентов');return;}state.compare.add(id);renderProducts();showCompare();}}
  else if(b.dataset.compareRemove){state.compare.delete(b.dataset.compareRemove);renderProducts();state.compare.size?showCompare():closePanel();}
  else if(b.dataset.quantity){const id=b.dataset.quantity;const delta=Number(b.dataset.delta);const raw=(state.cart[id]||0)+delta;if(raw<=0)delete state.cart[id];else state.cart[id]=Math.min(MAX_CART_QUANTITY,raw);updateCartHeader();renderProducts();showCart();$(`#panel [data-quantity="${id}"][data-delta="${delta}"]`)?.focus();}
  else if(b.dataset.remove){delete state.cart[b.dataset.remove];updateCartHeader();renderProducts();showCart();}
  else if(b.hasAttribute('data-cart-catalog')){closePanel();selectCategory('all');}
  else if(b.dataset.brand)selectManufacturer(b.dataset.brand);
  else if(b.dataset.clear){state.page=1;if(b.dataset.clear==='query'){state.query='';$('#search-input').value='';}else if(b.dataset.clear==='manufacturer'){state.manufacturer='';}else{state.category='all';syncCategoryControls();}refreshCatalogView();}
  else if(b.dataset.mode){if(b.dataset.mode==='popular')openInfo('offers');else openPanel('Новинки', '<p>В каталоге нет подтверждённых дат поступления товаров. Актуальные новинки уточняйте у компании.</p>'+contactMarkup());}
  else if(b.hasAttribute('data-retry-catalog'))loadCatalog();
  else if(b.hasAttribute('data-retry-view'))refreshCatalogView();
  else if(b.dataset.page){const page=Number(b.dataset.page);if(Number.isInteger(page)&&page>=1&&page<=Math.ceil(state.totalResults/state.pageSize)){state.page=page;renderProducts();$('#products').scrollIntoView({behavior:'smooth',block:'start'});}}

});
document.addEventListener('change',event=>{
  const pickerInput=event.target.closest?.('[data-quantity-input]');
  if(pickerInput){pickerInput.value=normalizeQuantity(pickerInput.value);return;}
  const cartInput=event.target.closest?.('[data-cart-quantity]');
  if(!cartInput)return;
  const id=cartInput.dataset.cartQuantity;
  if(!state.cart[id])return;
  state.cart[id]=normalizeQuantity(cartInput.value);
  updateCartHeader();renderProducts();showCart();
});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();if(state.loading){notify('Каталог ещё загружается');return;}searchProducts($('#search-input').value,$('#search-category').value);});
$('#catalog-category').addEventListener('change',event=>selectCategory(event.target.value));
$('#catalog-subcategory').addEventListener('change',event=>selectCategory(event.target.value||$('#catalog-category').value));
$('#catalog-sort').addEventListener('change',event=>{state.sort=event.target.value;state.mode='all';state.page=1;renderProducts();});
$('#catalog-toggle').addEventListener('click',()=>{const open=$('#catalog-menu').hidden;$('#catalog-menu').hidden=!open;$('#catalog-toggle').setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
$('#show-all').addEventListener('click',()=>selectCategory('all'));
$('#cart-open').addEventListener('click',showCart);
$('#panel-close').addEventListener('click',closePanel);
$('#panel').addEventListener('click',event=>{if(event.target===$('#panel')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closePanel();}});
$('#slide-prev').addEventListener('click',()=>{changeSlide(-1);startHeroTimer();});$('#slide-next').addEventListener('click',()=>{changeSlide(1);startHeroTimer();});
$('#slide-pause').addEventListener('click',()=>{heroPaused=!heroPaused;syncMotionControls();startHeroTimer();});
$('#hot-pause').addEventListener('click',()=>{hotPaused=!hotPaused;syncMotionControls();});
document.addEventListener('visibilitychange',()=>{syncMotionControls();startHeroTimer();});
reducedMotion.addEventListener('change',event=>{heroPaused=event.matches;syncMotionControls();});
window.addEventListener('pagehide',()=>{clearInterval(heroTimer);clearInterval(hotTimer);cancelAnimationFrame(hotRaf);});
window.addEventListener('pageshow',event=>{if(event.persisted){startHeroTimer();renderHotPositions();syncMotionControls();}});
syncMotionControls();startHeroTimer();
function composeQuote(data) {
  return `Здравствуйте!\n\nПрошу подготовить коммерческое предложение:\n${data.get('items')}\n\nИмя: ${data.get('name')}\nКомпания: ${data.get('company')||'—'}\nEmail: ${data.get('email')}\n\nПрошу уточнить цены, наличие и сроки поставки.`;
}
document.addEventListener('submit',event=>{
  if(event.target.id!=='quote-form')return;
  event.preventDefault();
  const body=composeQuote(new FormData(event.target));
  openPanel('Текст запроса',`<p>Запрос подготовлен. Его можно отправить на crec@crec.ru из вашей почты.</p><label class="quote-output-label" for="quote-output">Текст для копирования</label><textarea id="quote-output" class="quote-output" readonly>${esc(body)}</textarea><div class="quote-ready-actions"><a class="button red" href="mailto:crec@crec.ru?subject=${encodeURIComponent('Запрос коммерческого предложения — CREC')}&amp;body=${encodeURIComponent(body)}">Открыть в почте${icon('mail')}</a><button class="button outline" id="copy-quote" type="button">Скопировать запрос</button></div><p class="muted" style="margin-top:12px">Данные не отправлены. Заказ не оформлен.</p>${contactMarkup()}`,'quote-ready');
  $('#copy-quote').addEventListener('click',async()=>{
    const output=$('#quote-output');
    try { if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(output.value);notify('Запрос скопирован'); }
    catch { output.focus();output.select();notify('Текст выделен. Скопируйте его вручную.'); }
  });
});

hydrateIcons();loadCatalog();
if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register(`service-worker.js?v=${SITE_VERSION}`,{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{}));

document.querySelector('.brand').addEventListener('click',()=>{if(state.loading)return;state.query='';state.category='all';state.manufacturer='';state.mode='home';state.sort='source';state.page=1;document.querySelector('#search-input').value='';document.querySelector('#catalog-sort').value='source';syncCategoryControls();closeMenu();renderProducts();});
