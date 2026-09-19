'use strict';

const products = new Map();
const normalizeSearch = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');

function prepare(p) {
  return {
    id:p.id,
    name:p.name || '',
    price:p.price ?? null,
    sourceOrder:Number.isFinite(p.sourceOrder)?p.sourceOrder:Number.MAX_SAFE_INTEGER,
    categoryIds:Array.isArray(p.categoryIds)?p.categoryIds:[],
    searchText:normalizeSearch([p.id,p.name,p.brand,...(p.aliases||[]),p.description].filter(Boolean).join(' '))
  };
}

self.onmessage = event => {
  const msg=event.data || {};
  if(msg.type==='add') {
    for(const p of msg.products || []) products.set(p.id,prepare(p));
    self.postMessage({type:'added',requestId:msg.requestId,count:products.size});
    return;
  }
  if(msg.type==='query') {
    const selected=new Set(msg.selectedCategories || []);
    const brandIds=msg.brandProductIds ? new Set(msg.brandProductIds) : null;
    const words=String(msg.query||'').split(/\s+/).map(normalizeSearch).filter(Boolean);
    const result=[];
    for(const p of products.values()) {
      if(brandIds && !brandIds.has(p.id)) continue;
      if(!msg.allCategories && !p.categoryIds.some(id=>selected.has(id))) continue;
      if(words.length && !words.every(word=>p.searchText.includes(word))) continue;
      result.push(p);
    }
    switch(msg.sort) {
      case 'price-asc': result.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)||a.id.localeCompare(b.id)); break;
      case 'price-desc': result.sort((a,b)=>(b.price??-Infinity)-(a.price??-Infinity)||a.id.localeCompare(b.id)); break;
      case 'name': result.sort((a,b)=>a.name.localeCompare(b.name,'ru')); break;
      default: result.sort((a,b)=>a.sourceOrder-b.sourceOrder); break;
    }
    self.postMessage({type:'result',requestId:msg.requestId,ids:result.map(p=>p.id)});
  }
};
