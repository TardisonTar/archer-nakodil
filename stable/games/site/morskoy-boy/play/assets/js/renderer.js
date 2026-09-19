"use strict";
(() => {
const SEA_SHEAR = -.1410615846;
const SEA_TILT = .8;
const centerOf = i => [i % 10 + 1.5, Math.floor(i / 10) + 1.5];
const limit = (n, lo=0, hi=1) => Math.min(hi, Math.max(lo,n));

function visibleModels(fleet, shots, reveal) {
  return fleet.filter(ship => reveal || ship.cells.every(i => shots[i] === 'sunk'));
}

function shotDuration(type, reduced=false) {
  return reduced ? 180 : type === 'sunk' ? 2200 : type === 'hit' ? 650 : 850;
}

function shotOrigin(fleet, shots, incoming=false, random=Math.random) {
  if(incoming)return {index:Math.floor(random()*100),height:0};
  const afloat=fleet.filter(ship=>ship.cells.some(i=>shots[i]!=='sunk'));
  if(!afloat.length)return {index:Math.floor(random()*100),height:0};
  const ship=afloat[Math.floor(random()*afloat.length)];
  const intact=ship.cells.filter(i=>!shots[i]);
  const cells=intact.length?intact:ship.cells;
  return {index:cells[Math.floor(random()*cells.length)],height:.34};
}

class ShotTrails {
  constructor() {
    this.canvas=document.createElement('canvas');this.canvas.className='shot-trails';
    this.canvas.setAttribute('aria-hidden','true');this.canvas.hidden=true;document.body.append(this.canvas);
    this.ctx=this.canvas.getContext('2d');this.frame=0;this.timer=0;this.flight=null;
    this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}
      else if(this.flight)this.wake();
    });
  }

  clear() {
    clearTimeout(this.timer);cancelAnimationFrame(this.frame);
    this.timer=0;this.frame=0;this.flight=null;this.canvas.hidden=true;
    this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);
  }

  position(ocean,index,height=0) {
    const rect=ocean.wrapper.getBoundingClientRect();
    if(ocean.enabled&&ocean.w&&ocean.h){
      const [x,y]=ocean.project(...centerOf(index),height);
      return [rect.left+x*rect.width/ocean.w,rect.top+y*rect.height/ocean.h];
    }
    const cell=ocean.board.querySelector(`[data-index="${index}"]`)?.getBoundingClientRect();
    return cell?[cell.left+cell.width/2,cell.top+cell.height/2]:[rect.left+rect.width/2,rect.top+rect.height/2];
  }

  launch(from,to,origin,index,incoming,onImpact) {
    this.clear();
    if(!this.ctx||this.motion.matches){onImpact();return;}
    this.canvas.hidden=false;
    this.flight={from,to,origin,index,incoming,start:performance.now(),duration:760};
    this.draw(this.flight.start);this.wake();
    this.timer=setTimeout(()=>{this.clear();onImpact();},760);
  }

  wake() {
    if(this.frame||!this.flight||document.hidden)return;
    this.frame=requestAnimationFrame(t=>{this.frame=0;if(this.flight){this.draw(t);this.wake();}});
  }

  draw(t) {
    const f=this.flight;if(!f)return;
    const ctx=this.ctx,w=window.innerWidth,h=window.innerHeight,dpr=Math.min(window.devicePixelRatio||1,2);
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){
      this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const a=this.position(f.from,f.origin.index,f.origin.height),b=this.position(f.to,f.index);
    const dx=b[0]-a[0],dy=b[1]-a[1],vertical=Math.abs(dy)>Math.abs(dx);
    const bend=Math.min(100,Math.max(36,Math.hypot(dx,dy)*.18));
    const control=[(a[0]+b[0])/2+(vertical?bend:0),(a[1]+b[1])/2-(vertical?0:bend)];
    const point=p=>[(1-p)**2*a[0]+2*(1-p)*p*control[0]+p*p*b[0],(1-p)**2*a[1]+2*(1-p)*p*control[1]+p*p*b[1]];
    const progress=limit((t-f.start)/f.duration),color=f.incoming?'#ffad66':'#a6f7ff';
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    const tail=Math.max(0,progress-.38);
    for(let i=0;i<26;i++){
      const p0=tail+(progress-tail)*i/26,p1=tail+(progress-tail)*(i+1)/26;
      const alpha=(i+1)/26;
      ctx.beginPath();ctx.moveTo(...point(p0));ctx.lineTo(...point(p1));
      ctx.globalAlpha=alpha*.11;ctx.strokeStyle=color;ctx.lineWidth=9;ctx.stroke();
      ctx.globalAlpha=alpha*.88;ctx.lineWidth=2.4;ctx.stroke();
    }
    const [x,y]=point(progress);
    ctx.globalAlpha=1;ctx.shadowBlur=16;ctx.shadowColor=color;ctx.fillStyle='#fffbe8';
    ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill();
    if(progress<.22){
      ctx.globalAlpha=(1-progress/.22)*.8;ctx.fillStyle=color;
      ctx.beginPath();ctx.arc(...a,3+progress*32,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

class OceanBoard {
  constructor(board) {
    this.board=board;this.wrapper=board.parentElement;
    this.water=document.createElement('canvas');this.canvas=document.createElement('canvas');
    this.water.className='ocean-water';this.canvas.className='ocean-models';
    this.water.setAttribute('aria-hidden','true');this.canvas.setAttribute('aria-hidden','true');
    this.wrapper.prepend(this.water);this.wrapper.append(this.canvas);
    this.webgl=window.Battleship3D?.OceanLayer?new window.Battleship3D.OceanLayer(this.wrapper):null;
    this.ctx=this.canvas.getContext('2d');this.sea=this.water.getContext('2d');
    this.enabled=!!this.ctx&&!!this.sea;
    if(!this.enabled){this.water.remove();this.canvas.remove();return;}
    this.wrapper.classList.add('ocean-wrapper');
    this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    this.fleet=[];this.shots=[];this.effects=[];this.sinking=new Map();this.active=false;
    this.frame=0;this.lastFrame=0;this.hover=-1;this.reveal=false;this.lastShot=-1;this._weather='calm';Object.defineProperty(this,'weather',{get:()=>this._weather,set:v=>{this._weather=v||'calm';this.webgl?.setWeather(this._weather)}});
    this.motion.addEventListener('change',()=>this.wake());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();else this.wake();});
    this.observer=new ResizeObserver(()=>{this.resize();this.draw(performance.now());this.wake();});
    this.observer.observe(this.wrapper);
    board.addEventListener('pointerleave',()=>{this.hover=-1;this.wake();});
    board.addEventListener('focusout',e=>{if(!board.contains(e.relatedTarget)){this.hover=-1;this.wake();}});
  }

  resize() {
    if(!this.enabled)return;
    const w=this.wrapper.clientWidth,h=this.wrapper.clientHeight;
    if(!w||!h)return;
    this.w=w;this.h=h;this.unit=w*.83/11;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    for(const canvas of [this.canvas,this.water]) {
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)) {
        canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      }
      canvas.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
    }
  }

  project(x,y,z=0) {
    return [this.w*.15+(x+y*SEA_SHEAR)*this.unit,this.h*.05+(y*SEA_TILT-z*.9)*this.unit];
  }

  setData(fleet,shots,reveal,lastShot=-1) {
    if(!this.enabled)return;
    this.active=true;
    this.fleet=visibleModels(fleet,shots,reveal).map(s=>({cells:[...s.cells]}));
    this.shots=[...shots];this.reveal=reveal;this.lastShot=lastShot;
    this.resize();this.webgl?.setData(this.fleet,this.shots,reveal);this.draw(performance.now());this.wake();
  }

  setHover(index) {if(this.enabled){this.hover=index;this.wake();}}

  clear() {
    if(!this.enabled)return;
    this.active=false;this.pause();this.fleet=[];this.shots=[];this.effects=[];this.sinking.clear();this.hover=-1;
    this.ctx.clearRect(0,0,this.w||0,this.h||0);this.sea.clearRect(0,0,this.w||0,this.h||0);this.webgl?.clear();
  }

  pause() {cancelAnimationFrame(this.frame);this.frame=0;}

  wake() {
    if(!this.enabled||!this.active||this.frame||document.hidden)return;
    this.frame=requestAnimationFrame(t=>this.tick(t));
  }

  tick(t) {
    this.frame=0;
    if(!this.active||document.hidden)return;
    if(t-this.lastFrame>30){this.lastFrame=t;this.draw(t);}
    if(!this.motion.matches||this.effects.length)this.wake();
    else this.draw(t);
  }

  impact(index,type,shipCells=[]) {
    if(!this.enabled||!this.active)return;
    const now=performance.now(),reduced=this.motion.matches;
    if(type==='sunk')this.sinking.set(shipCells.join(','),now);this.webgl?.impact(index,type);
    const points=type==='sunk'&&!reduced?shipCells:[index];
    points.forEach((cell,n)=>{
      const [x,y]=centerOf(cell);
      const particles=Array.from({length:reduced?0:type==='miss'?23:35},(_,i)=>{
        const angle=i*2.39996+Math.random()*.4,speed=.3+Math.random()*.8;
        return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:1.2+Math.random()*2.4,size:.025+Math.random()*.065,life:.65+Math.random()*.7};
      });
      this.effects.push({x,y,type,start:now+(type==='sunk'?n*100:0),particles,duration:reduced?180:type==='sunk'?1850:1250});
    });
    this.wake();
  }

  polygon(ctx,points,color,stroke) {
    ctx.beginPath();points.forEach((p,i)=>{const [x,y]=this.project(...p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.65;ctx.stroke();}
  }

  line(ctx,points,color,width=1) {
    ctx.beginPath();points.forEach((p,i)=>{const [x,y]=this.project(...p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }

  ring(ctx,x,y,r,alpha,color='#b7f4ff',width=1.2) {
    ctx.save();ctx.globalAlpha=limit(alpha);ctx.strokeStyle=color;ctx.lineWidth=width;
    ctx.beginPath();
    for(let i=0;i<=36;i++){const a=i/36*Math.PI*2,p=this.project(x+Math.cos(a)*r,y+Math.sin(a)*r);if(i)ctx.lineTo(...p);else ctx.moveTo(...p);}
    ctx.stroke();ctx.restore();
  }

  glowAt(ctx,x,y,rx,ry,color,alpha=.5) {
    const [px,py]=this.project(x,y,.04);
    ctx.save();
    ctx.globalAlpha=alpha;
    const g=ctx.createRadialGradient(px,py,0,px,py,Math.max(rx,ry)*this.unit*1.4);
    g.addColorStop(0,color);
    g.addColorStop(.55,'rgba(170,255,110,0.18)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.ellipse(px,py,rx*this.unit,ry*this.unit,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  drawWaveStripe(ctx, points, color, width, alpha=1) {
    ctx.save();ctx.globalAlpha=alpha;this.line(ctx,points,color,width);ctx.restore();
  }

  drawWater(t) {
    const ctx=this.sea;ctx.clearRect(0,0,this.w,this.h);
    const time=this.motion.matches?0:t;
    const weather=this.weather||'calm',wind=weather==='storm'?1.75:weather==='tactical'?1.25:1;

    this.polygon(ctx,[[1,11,0],[11,11,0],[11,11,-.36],[1,11,-.36]],'#04131f','#132d3b');
    this.polygon(ctx,[[11,1,0],[11,11,0],[11,11,-.36],[11,1,-.36]],'#030e19','#143443');

    const g=ctx.createLinearGradient(0,0,this.w,this.h);
    g.addColorStop(0,'#07111d');
    g.addColorStop(.2,'#0a1624');
    g.addColorStop(.5,'#0d2030');
    g.addColorStop(.82,'#11293a');
    g.addColorStop(1,'#173646');
    this.polygon(ctx,[[1,1],[11,1],[11,11],[1,11]],g,'#2f5262');

    ctx.save();
    const haze=ctx.createRadialGradient(this.w*.45,this.h*.38,this.w*.06,this.w*.45,this.h*.38,this.w*.9);
    haze.addColorStop(0,'rgba(18,44,58,0)');
    haze.addColorStop(1,'rgba(0,0,0,0.72)');
    ctx.fillStyle=haze;
    ctx.fillRect(0,0,this.w,this.h);
    ctx.restore();

    this.glowAt(ctx,2.3,2.3,0.44,0.36,'rgba(175,215,95,0.9)',.16);
    this.glowAt(ctx,8.9,2.6,0.5,0.42,'rgba(192,232,112,0.9)',.16);

    // Deep swell bands across the whole board.
    for(let row=0; row<9; row++) {
      const depth=row/8;
      const body=[];
      const edge=[];
      const shadow=[];
      for(let step=0; step<=26; step++) {
        const x=1+step*(10/26);
        const phase=time*.00106 + row*.66 + step*.19;
        const amplitude=(.12 + depth*.16)*wind;
        const y=3.8+row*.82 + Math.sin(phase)*amplitude + Math.cos(phase*.48)*.08;
        body.push([x,y,.02+depth*.02]);
        edge.push([x,y-.06-amplitude*.22,.05+depth*.03]);
        shadow.push([x,y+.08+amplitude*.15,0]);
      }
      this.drawWaveStripe(ctx,shadow,'rgba(1,10,18,0.42)',3.3-depth*.4,.55);
      this.drawWaveStripe(ctx,body,`rgba(18,51,67,${.72-depth*.24})`,2.8-depth*.12,.96);
      this.drawWaveStripe(ctx,edge,`rgba(164,224,240,${.08+(1-depth)*.14})`,1.15,.88);
    }

    // Strong foreground crests to mimic rolling waves near camera.
    for(let ridge=0; ridge<5; ridge++) {
      const yBase=6.55+ridge*.62;
      const body=[];
      const fill=[];
      const highlight=[];
      for(let step=0; step<=20; step++) {
        const x=1.05+step*(9.7/20);
        const phase=time*.0015 + ridge*.93 + step*.44;
        const amp=(.24+.05*ridge)*wind;
        const y=yBase+Math.sin(phase)*amp+Math.cos(phase*.52)*.12;
        body.push([x,y,.07]);
        fill.push([x,y+.16+amp*.28,0]);
        highlight.push([x,y-.08,.12]);
      }
      this.drawWaveStripe(ctx,fill,'rgba(5,18,28,0.75)',5.2-ridge*.35,.9);
      this.drawWaveStripe(ctx,body,'rgba(9,31,45,0.98)',4.4-ridge*.25,.95);
      this.drawWaveStripe(ctx,highlight,'rgba(203,247,255,0.32)',1.3,.95);
    }

    // diagonal grid / tactical lines preserved beneath water
    for(let n=0;n<=10;n++) {
      this.drawWaveStripe(ctx,[[1,n+1,.001],[11,n+1,.001]],'rgba(157,217,233,0.052)',.68,.6);
      this.drawWaveStripe(ctx,[[n+1,1,.001],[n+1,11,.001]],'rgba(157,217,233,0.04)',.68,.55);
    }

    // sparkles and fine ripples
    for(let y=0;y<10;y++)for(let x=0;x<10;x++) {
      const phase=Math.sin(time*.00088+x*.87+y*1.93),cx=x+1.5,cy=y+1.45+phase*.07;
      this.line(ctx,[[cx-.34,cy],[cx-.16,cy-.03],[cx+.03,cy+.008],[cx+.24,cy-.02]],`rgba(132,214,235,${.024+(phase+1)*.022})`,.78);
      if((x+y)%3===0) {
        const [px,py]=this.project(cx+.1*Math.sin(phase),cy-.08,0.05);
        ctx.fillStyle=`rgba(220,255,244,${.03+(phase+1)*.022})`;
        ctx.beginPath();ctx.arc(px,py,.9,0,Math.PI*2);ctx.fill();
      }
    }
  }

  drawShip(ship,t) {
    const ctx=this.ctx,cells=ship.cells,n=cells.length;
    const first=centerOf(cells[0]),last=centerOf(cells[n-1]),cx=(first[0]+last[0])/2,cy=(first[1]+last[1])/2;
    const vertical=n>1&&cells[1]-cells[0]===10;
    const sunk=cells.every(i=>this.shots[i]==='sunk');
    const damage=cells.filter(i=>this.shots[i]==='hit'||this.shots[i]==='sunk').length;
    const started=this.sinking.get(cells.join(','));
    const progress=sunk?(started===undefined||this.motion.matches?1:limit((t-started-180)/1800)):0;
    if(progress>=1&&started!==undefined)this.sinking.delete(cells.join(','));
    const bob=this.motion.matches||sunk?0:Math.sin(t*.00165+cells[0])*.024 + Math.cos(t*.00105+n)*.01;
    const lift=bob-progress*.53,tilt=progress*.12;
    const transform=(u,v,z=0)=>[cx+(vertical?-v:u),cy+(vertical?u:v),z+lift+u*tilt];
    const half=n/2+.03,beam=n===1?.25:.34;
    const hull=[[-half,-beam*.7],[half-.54,-beam],[half-.16,-beam*.74],[half+.02,0],[half-.16,beam*.74],[half-.54,beam],[-half,beam*.7],[-half+.18,0]];
    const faces=[];
    const add=(points,color,stroke)=>faces.push({points:points.map(p=>transform(...p)),color,stroke});
    const prism=(shape,z,h,top,side,altSide=side)=>{
      for(let i=0;i<shape.length;i++){
        const a=shape[i],b=shape[(i+1)%shape.length];
        add([[...a,z],[...b,z],[...b,z+h],[...a,z+h]],i%2?altSide:side,'#192b36');
      }
      add(shape.map(p=>[...p,z+h]),top,'#7f98a3');
    };
    const box=(u,v,w,d,z,h,top='#6e7d86',side='#334751',alt=side)=>prism([[u-w/2,v-d/2],[u+w/2,v-d/2],[u+w/2,v+d/2],[u-w/2,v+d/2]],z,h,top,side,alt);
    const darkHull=sunk?'#455864':'#1e262d';
    const sideHull=sunk?'#374954':'#111920';
    const deck=sunk?'#5c717c':'#454f58';
    const steel=sunk?'#7a8c95':'#7d8a92';
    const tower=sunk?'#62757f':'#56656e';
    const gun=sunk?'#6c7c85':'#90979d';

    ctx.save();ctx.globalAlpha=sunk?1-progress*.82:1;

    // glow mainly around the ship, not across the entire ocean.
    if(!sunk){
      this.glowAt(ctx,cx,cy,.78+n*.1,.26+n*.02,'rgba(178,255,105,0.95)',.22);
      this.glowAt(ctx,cx-half*.18,cy,.44,.18,'rgba(203,255,136,0.85)',.12);
    }

    this.polygon(ctx,hull.map(([u,v])=>[cx+(vertical?-v:u)+.16,cy+(vertical?u:v)+.18]),'#00091178');
    if(!sunk){
      const wake=hull.map(([u,v])=>transform(u,v*1.26,0));
      this.line(ctx,[...wake,wake[0]],'rgba(155,242,247,0.18)',1.5);
      this.line(ctx,[transform(-half+.18,0,.03),transform(-half-.34,0,.0)],'rgba(191,246,249,0.22)',1.9);
      this.line(ctx,[transform(-half+.08,-.1,.02),transform(-half-.28,-.18,0)],'rgba(191,246,249,0.13)',1.4);
      this.line(ctx,[transform(-half+.08,.1,.02),transform(-half-.28,.18,0)],'rgba(191,246,249,0.13)',1.4);
    }

    prism(hull,-.02,.24,darkHull,sideHull,'#24323a');
    const deckShape=hull.map(([u,v])=>[u*.93,v*.78]);
    add(deckShape.map(p=>[...p,.235]),deck,'#9db0b9');
    add([[half-.78,-beam*.6,.245],[half-.18,-beam*.24,.245],[half-.18,beam*.24,.245],[half-.78,beam*.6,.245]],'#626f78','#7e98a5');
    this.line(ctx,deckShape.map(([u,v])=>transform(u,v,.246)),'rgba(214,236,242,0.48)',.78);

    const barrel=(u,v,len=0.48,z=.46,spread=0)=>{
      add([[u,v-spread,z+.02],[u+len,v-spread,z+.06],[u+len,v-spread,z+.11],[u,v-spread,z+.07]],gun,'#d6dce0');
      box(u+len*.55,v-spread,.04,.032,z+.01,len*.1,gun,'#47545b');
    };
    const turret=(u,v,main=false)=>{
      const w=main?.44:.35,d=.31,h=main?.18:.15;
      add([[u-w/2,-d/2+v,.26],[u+w/2,-d/2+v,.26],[u+w/2-d*.12,v,.26+h*.35],[u+w/2,d/2+v,.26],[u-w/2,d/2+v,.26],[u-w/2+d*.08,v,.26+h*.35]],tower,'#95a8b0');
      box(u-.03,v,w*.72,d*.72,.27,h,steel,'#44545d');
      barrel(u+w*.02,v,main?.56:.46,.48,-.06);
      barrel(u+w*.02,v,main?.56:.46,.48,.06);
      if(main)barrel(u+w*.01,v,main?.52:.42,.465,0);
    };

    if(n===1){
      box(-.03,0,.3,.3,.26,.18,steel,'#3d4f58');
      box(-.06,0,.18,.2,.45,.1,'#aab6bc','#4e5e68');
      box(.12,0,.12,.1,.34,.1,'#8a979f','#475660');
      this.line(ctx,[transform(-.1,-.12,.56),transform(-.1,.12,.56)],'rgba(228,245,250,0.7)',.7);
    }else{
      // heavy battleship superstructure
      box(-.34,0,n===4?.92:.68,.36,.26,.24,steel,'#33424b');
      box(-.2,0,.42,.28,.5,.18,'#9ba9b1','#475760');
      box(-.12,0,.26,.2,.68,.14,'#b7c1c5','#4f616a');
      box(-.08,0,.15,.13,.83,.22,'#6f8088','#3b4a53');
      box(-.92,0,.26,.18,.26,.3,'#45555f','#2d3b44');
      box(-.52,0,.18,.14,.44,.14,'#7f9099','#43535c');

      // tower / masts
      this.line(ctx,[transform(-.08,0,.94),transform(-.08,0,1.34)],'rgba(201,221,229,0.85)',1.2);
      this.line(ctx,[transform(-.08,0,1.34),transform(.12,-.09,1.08)],'rgba(146,177,190,0.58)',.8);
      this.line(ctx,[transform(-.08,0,1.34),transform(.12,.09,1.08)],'rgba(146,177,190,0.58)',.8);
      this.line(ctx,[transform(-.24,0,1.12),transform(-.24,0,1.36)],'rgba(189,213,223,0.72)',.85);
      this.line(ctx,[transform(-.58,0,.72),transform(-.58,0,1.02)],'rgba(162,189,200,0.5)',.8);
      for(const level of [1.06,1.16,1.26]) {
        this.line(ctx,[transform(-.16,-.25,level),transform(-.16,.25,level)],'rgba(184,209,220,0.45)',.6);
      }
      this.line(ctx,[transform(-.56,-.18,.95),transform(-.56,.18,.95)],'rgba(164,192,204,0.32)',.55);

      // deck details
      this.line(ctx,[transform(-half+.18,-beam*.38,.16),transform(half-.35,-beam*.38,.16)],'rgba(156,191,205,0.34)',1);
      this.line(ctx,[transform(-half+.18,beam*.38,.16),transform(half-.35,beam*.38,.16)],'rgba(156,191,205,0.28)',1);
      this.line(ctx,[transform(-.88,-.14,.36),transform(.18,-.14,.36)],'rgba(90,109,120,0.48)',.75);
      this.line(ctx,[transform(-.88,.14,.36),transform(.18,.14,.36)],'rgba(90,109,120,0.42)',.75);

      // turrets: two strong battery groups
      turret(half-.82,0,true);
      turret(Math.max(-.03,-half+.78),0,n>=3);
      if(n===4) {
        box(-1.24,-.18,.24,.14,.28,.13,'#5d6d76','#36444d');
        box(-1.24,.18,.24,.14,.28,.13,'#5d6d76','#36444d');
        this.line(ctx,[transform(-1.1,-.18,.38),transform(-1.34,-.36,.62)],'rgba(165,199,212,0.45)',.6);
        this.line(ctx,[transform(-1.1,.18,.38),transform(-1.34,.36,.62)],'rgba(165,199,212,0.45)',.6);
      }

      const [bx,by]=this.project(...transform(-.04,-.01,.73));
      const win=ctx.createRadialGradient(bx,by,0,bx,by,this.unit*.2);
      win.addColorStop(0,'rgba(192,223,231,0.46)');
      win.addColorStop(1,'rgba(192,223,231,0)');
      ctx.fillStyle=win;ctx.fillRect(bx-this.unit*.26,by-this.unit*.18,this.unit*.52,this.unit*.36);
      for(const dot of [[-.08,0,1.34],[.12,-.09,1.08],[.12,.09,1.08],[-.58,0,1.02]]) {
        const [px,py]=this.project(...transform(...dot));
        ctx.fillStyle='rgba(213,237,245,0.68)';
        ctx.beginPath();ctx.arc(px,py,1.25,0,Math.PI*2);ctx.fill();
      }
      this.line(ctx,[transform(-half+.08,-beam*.72,.31),transform(half-.16,-beam*.64,.37)],'rgba(205,232,241,0.22)',.85);
    }

    faces.sort((a,b)=>{
      const level=f=>Math.min(...f.points.map(p=>p[2]));
      const depth=f=>f.points.reduce((s,p)=>s+p[1]+p[2]*.08,0)/f.points.length;
      return level(a)-level(b)||depth(a)-depth(b);
    });
    for(const face of faces)this.polygon(ctx,face.points,face.color,face.stroke);

    if(damage&&!sunk){
      const [sx,sy]=this.project(...transform(-.12,0,.92));
      ctx.save();
      for(let i=0;i<3+damage;i++){const age=this.motion.matches?i/(3+damage):((t*.00018+i/(3+damage))%1);ctx.globalAlpha=(1-age)*(.13+damage*.035);ctx.fillStyle=i%2?'#65747c':'#2e383e';ctx.beginPath();ctx.arc(sx+Math.sin(i*2.2+t*.0008)*this.unit*.08*age,sy-this.unit*(.18+age*.72),this.unit*(.035+age*.10),0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }

    ctx.restore();
    if(sunk&&progress<1){
      this.ring(ctx,cx,cy,.5+progress*n*.5,(1-progress)*.8,'#c4f6ff',1.5);
    }
  }

  flame(x,y,t,scale=1) {
    const ctx=this.ctx,[px,py]=this.project(x,y,.22),s=this.unit*scale;
    const flicker=this.motion.matches ? .7 : .72+Math.sin(t*.024+x)*.14;
    ctx.save();
    const glow=ctx.createRadialGradient(px,py,0,px,py,s*.45);
    glow.addColorStop(0,'#ffb33688');glow.addColorStop(1,'#ff550000');ctx.fillStyle=glow;ctx.fillRect(px-s*.5,py-s*.5,s,s);
    for(let n=0;n<3;n++){
      const h=s*(.32+n*.06)*flicker,dx=(n-1)*s*.07;
      ctx.fillStyle=n===0?'#f45b29':n===1?'#ffad36':'#fff3b0';ctx.beginPath();
      ctx.moveTo(px+dx-s*.095,py);ctx.quadraticCurveTo(px+dx-s*.12,py-h*.5,px+dx+Math.sin(t*.008+n)*s*.04,py-h);
      ctx.quadraticCurveTo(px+dx+s*.14,py-h*.2,px+dx+s*.07,py);ctx.fill();
    }
    for(let n=0;n<4;n++){
      const age=this.motion.matches?(n+.5)/4:((t*.00035+n*.25)%1);
      ctx.globalAlpha=(1-age)*.28;ctx.fillStyle='#6c7d86';ctx.beginPath();
      ctx.arc(px+s*age*.2,py-s*(.32+age*.83),s*(.08+age*.16),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  drawMarks(t) {
    const ctx=this.ctx;
    this.shots.forEach((shot,i)=>{
      if(!shot)return;const [x,y]=centerOf(i),[px,py]=this.project(x,y);
      if(shot==='hit'){this.flame(x,y,t);return;}
      if(shot==='sunk'){
        this.line(ctx,[[x-.13,y-.13],[x+.13,y+.13]],'#ffb28b',1.5);
        this.line(ctx,[[x-.13,y+.13],[x+.13,y-.13]],'#ffb28b',1.5);
      }else{
        ctx.fillStyle=shot==='miss'?'#bbdce6':'#7099a877';ctx.beginPath();ctx.arc(px,py,shot==='miss'?2:1.1,0,Math.PI*2);ctx.fill();
        if(shot==='miss')this.ring(ctx,x,y,.12,.38,'#c5edff',.8);
      }
    });
    if(this.lastShot>=0){const [x,y]=centerOf(this.lastShot);this.ring(ctx,x,y,.35,.7,'#d1eef5',1);}
    if(this.hover>=0&&!this.shots[this.hover]){
      const [x,y]=centerOf(this.hover);
      this.ring(ctx,x,y,.32,.85,'#a2ffe6',1.2);
      this.line(ctx,[[x-.46,y],[x-.23,y]],'#c1fff3',1.1);this.line(ctx,[[x+.23,y],[x+.46,y]],'#c1fff3',1.1);
      this.line(ctx,[[x,y-.46],[x,y-.23]],'#c1fff3',1.1);this.line(ctx,[[x,y+.23],[x,y+.46]],'#c1fff3',1.1);
    }
  }

  drawEffects(t) {
    const ctx=this.ctx;
    this.effects=this.effects.filter(e=>t-e.start<e.duration);
    for(const e of this.effects){
      const age=(t-e.start)/1000;if(age<0)continue;
      const progress=limit(age/(e.duration/1000)),[px,py]=this.project(e.x,e.y,.15),miss=e.type==='miss';
      ctx.save();
      this.ring(ctx,e.x,e.y,.12+age*1.05,(1-progress)*.85,miss?'#dcfaff':'#ffcc91',2*(1-progress)+.4);
      this.ring(ctx,e.x,e.y,.06+age*.65,(1-progress)*.6,'#b2f1ff',1.2);
      if(this.motion.matches){
        this.ring(ctx,e.x,e.y,.25,.8,miss?'#fff':'#ffc880',3);ctx.restore();continue;
      }
      if(age<.35){
        const r=this.unit*(miss?.35:.85)*(.25+age*3),g=ctx.createRadialGradient(px,py,0,px,py,r);
        g.addColorStop(0,miss?'#f0ffff':'#fffdd7');g.addColorStop(.3,miss?'#a7e5f3cc':'#ffb92be0');g.addColorStop(1,miss?'#64c9ff00':'#ff430000');
        ctx.globalAlpha=1-age/.35;ctx.fillStyle=g;ctx.fillRect(px-r,py-r,r*2,r*2);ctx.globalAlpha=1;
      }
      if(miss&&age<.7){
        const height=Math.sin(age/.7*Math.PI)*1.5,width=.13+age*.20;
        this.polygon(ctx,[[e.x-width,e.y,0],[e.x-width*.25,e.y,height*.8],[e.x,e.y,height],[e.x+width*.25,e.y,height*.7],[e.x+width,e.y,0]],`rgba(192,241,255,${(1-age/.7)*.9})`);
      }
      for(const p of e.particles){
        if(age>p.life)continue;
        const z=(miss?0:.3)+p.vz*age-3.2*age*age;if(z<0)continue;
        const [x,y]=this.project(e.x+p.vx*age,e.y+p.vy*age,z);
        ctx.globalAlpha=limit((p.life-age)*1.7);ctx.fillStyle=miss?'#d3f8ff':age<.35?'#ffeeb0':'#ef853d';
        ctx.beginPath();ctx.arc(x,y,Math.max(.5,p.size*this.unit*(1-progress)),0,Math.PI*2);ctx.fill();
      }
      if(!miss){ctx.globalAlpha=1;this.flame(e.x,e.y,t,1-progress*.6);}
      ctx.restore();
    }
  }

  draw(t) {
    if(!this.enabled||!this.active||!this.w)return;
    const time=this.motion.matches?0:t;
    this.drawWater(time);this.ctx.clearRect(0,0,this.w,this.h);
    [...this.fleet].sort((a,b)=>a.cells.at(-1)-b.cells.at(-1)).forEach(ship=>this.drawShip(ship,t));
    this.drawMarks(time);this.drawEffects(t);
  }
}

window.BattleshipRenderer = Object.freeze({shotDuration,shotOrigin,ShotTrails,OceanBoard});
})();
