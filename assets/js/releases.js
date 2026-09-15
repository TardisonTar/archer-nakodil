"use strict";
(() => {
  const script=document.currentScript;
  const root=script ? new URL('../../',script.src) : new URL('/',location.href);
  const statusNames={idea:'Идея',development:'В разработке',alpha:'Alpha',beta:'Beta',stable:'Stable',archived:'Архив'};
  const setText=(selector,value,format='')=>document.querySelectorAll(selector).forEach(el=>{
    const prefix=el.dataset.prefix??format;
    el.textContent=`${prefix}${value}`;
  });
  const setHref=(selector,value)=>document.querySelectorAll(selector).forEach(el=>{el.href=value;});
  async function load(){
    try{
      const response=await fetch(new URL('data/releases.json',root),{cache:'no-store'});
      if(!response.ok)throw new Error('release-manifest');
      const manifest=await response.json();
      for(const [slug,release] of Object.entries(manifest.projects||{})){
        setText(`[data-project-version="${slug}"]`,release.version);
        setText(`[data-project-status="${slug}"]`,statusNames[release.status]||release.status);
        setHref(`[data-project-play="${slug}"]`,release.playUrl);
        setHref(`[data-project-download="${slug}"]`,release.downloadUrl);
        document.querySelectorAll(`[data-project-build="${slug}"]`).forEach(el=>el.textContent=String(release.build));
      }
      document.documentElement.dataset.releaseManifest='ready';
    }catch{
      document.documentElement.dataset.releaseManifest='fallback';
    }
  }
  void load();
})();
