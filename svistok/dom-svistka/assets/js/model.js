(() => {
'use strict';
const root=document.getElementById('building-model');
const $=id=>root.querySelector('#'+id), stage=$('bm-stage'), labelLayer=$('bm-labels');
if(!window.THREE){$('bm-loading').textContent='Не удалось загрузить 3D. Откройте сохранённую модель в браузере.';return;}
const T=window.THREE, state={floor:'both',full:true,top:false,explode:false,showBasement:true,showTerrain:true,showFoundation:true,showDoors:true,wallAreas:false,showVentFacade:true,facadeColor:'#b8bec4',facadeMaterial:'panel',comparison:1,panelSize:.6,groundColor:'#789e58',freeCamera:false,walk:false,theta:0.30,phi:0.80,zoom:1,selected:'',panX:0,panZ:0};
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}
catch(e){$('bm-loading').textContent='Для просмотра модели включите аппаратное ускорение в браузере.';return;}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
stage.insertBefore(renderer.domElement,labelLayer);$('bm-loading').hidden=true;
const scene=new T.Scene(), orbitCamera=new T.OrthographicCamera(-10,10,10,-10,0.1,150),freeCamera=new T.PerspectiveCamera(45,1,.05,1000);
let camera=orbitCamera;
const freeAngles=new T.Euler(0,0,0,'YXZ');
scene.add(new T.HemisphereLight(0xffffff,0x999999,2.5));
const sun=new T.DirectionalLight(0xffffff,3.0);sun.position.set(-10,25,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.045;sun.shadow.bias=-.0002;scene.add(sun);
const fill=new T.DirectionalLight(0xffffff,1.1);fill.position.set(14,8,-12);scene.add(fill);
const palette={},mats={}, groups={}, labels=[], picks=[],elementPicks=[],wallLabels=[];
let selectedElement=null;
let wallOccluders=[];
let terrainGroup,foundationGroup,avatarGroup;
const walker={height:1.85,eyeHeight:1.75,radius:.19,maxStep:.23,position:new T.Vector3(.35,2,10.48),phase:0};
const physics={surfaces:[],solids:[]};
const scratchColor=document.createElement('span');scratchColor.hidden=true;root.appendChild(scratchColor);
function cssColor(token){scratchColor.style.color='var('+token+')';return new T.Color(getComputedStyle(scratchColor).color);}
function mix(a,b,t){return a.clone().lerp(b,t);}
function mat(color,roughness=.82){return new T.MeshStandardMaterial({color,roughness,metalness:0});}
function texture(kind,base){
 const c=document.createElement('canvas');c.width=c.height=256;const q=c.getContext('2d');q.fillStyle='#'+base.getHexString();q.fillRect(0,0,256,256);
 let seed=13;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 if(kind==='wood'){
  for(let row=0;row<16;row++){const v=(rnd()-.5)*.12;q.fillStyle='#'+base.clone().offsetHSL(0,0,v).getHexString();q.fillRect(0,row*16,256,15);
   q.strokeStyle='#'+base.clone().offsetHSL(0,0,-.13).getHexString();q.lineWidth=.7;q.beginPath();q.moveTo(0,row*16);q.lineTo(256,row*16);const j=(row*77)%256;q.moveTo(j,row*16);q.lineTo(j,row*16+16);q.stroke();
   for(let j=0;j<7;j++){q.globalAlpha=.12;q.strokeStyle='#'+palette.fg.getHexString();q.beginPath();q.moveTo(rnd()*100,row*16+rnd()*15);q.lineTo(120+rnd()*136,row*16+rnd()*15);q.stroke();q.globalAlpha=1;}
  }
 }else if(kind==='tile'){
  q.strokeStyle='#'+mix(base,palette.fg,.13).getHexString();q.lineWidth=1.3;for(let i=0;i<=256;i+=64){q.beginPath();q.moveTo(i,0);q.lineTo(i,256);q.moveTo(0,i);q.lineTo(256,i);q.stroke();}
 }else{
  for(let i=0;i<12000;i++){q.globalAlpha=.045;q.fillStyle=rnd()>.5?'#'+palette.fg.getHexString():'#'+palette.bg.getHexString();q.fillRect(rnd()*256,rnd()*256,1.5,1.5);}q.globalAlpha=1;
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='wood'?2:3,kind==='wood'?3:4);t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
}
function setMaterials(){
 palette.bg=cssColor('--background');palette.fg=cssColor('--foreground');palette.accent=cssColor('--viz-series-1');palette.warm=cssColor('--orange');
 palette.dark=palette.bg.getHSL({}).l<.4;
 const paper=palette.dark?mix(palette.bg,palette.fg,.47):mix(palette.bg,palette.fg,.055);
 const wood=mix(paper,palette.warm,palette.dark?.26:.31);
 mats.wall=mat(paper);mats.cap=mat(mix(palette.fg,palette.bg,palette.dark?.37:.18));mats.slab=mat(mix(paper,palette.fg,.12));
 mats.wood=mat(wood);mats.wood.map=texture('wood',wood);
 mats.tile=mat(mix(paper,palette.fg,.07));mats.tile.map=texture('tile',mats.tile.color);
 mats.concrete=mat(mix(paper,palette.fg,.08));mats.concrete.map=texture('concrete',mats.concrete.color);
 mats.door=mat(mix(wood,palette.warm,.28));mats.trim=mat(mix(paper,palette.fg,.015));mats.metal=mat(mix(palette.fg,palette.bg,.35),.45);
 mats.glass=new T.MeshStandardMaterial({color:mix(paper,palette.accent,.11),transparent:true,opacity:.28,roughness:.08,metalness:.15,depthWrite:false,side:T.DoubleSide});
 mats.fixture=mat(paper,.3);mats.water=mat(mix(paper,palette.accent,.11),.1);
 mats.terrainTop=mat(new T.Color(state.groundColor));mats.terrainTop.map=texture('concrete',new T.Color(0xffffff));
 mats.terrainSide=mat(mix(new T.Color(state.groundColor),palette.fg,.35));
 mats.foundation=mat(mix(paper,palette.fg,.24));mats.foundation.map=texture('concrete',new T.Color(0xffffff));
 mats.facadePanel=mat(new T.Color(state.facadeColor),.62);mats.facadePanel.map=texture('concrete',new T.Color(0xffffff));
 mats.facadeBacking=mat(mix(palette.fg,paper,.12));
 mats.clothes=mat(mix(palette.accent,palette.fg,.32));mats.skin=mat(mix(paper,palette.warm,.13));
 mats.highlight=new T.MeshBasicMaterial({color:palette.accent,transparent:true,opacity:.28,depthWrite:false,side:T.DoubleSide});
}
const rect=(x1,z1,x2,z2)=>[[x1,z1],[x2,z1],[x2,z2],[x1,z2]];
const modelConfig={clearHeight:2.7,structuralHeight:3};
const levelNames={ground:'1 этаж',basement:'Цоколь',upper:'2 этаж'};
const siteConfig={gradeY:2,basementAboveGrade:1,margin:5,bottomY:-.5,outerBounds:{minX:-5,maxX:15.88,minZ:-5,maxZ:20.04}};
const windowWells=[
 {side:-1,x:-.45,z:5.33,depth:.90,span:1.30,bottom:.55,dimensioned:true},
 {side:1,x:11.33,z:5.33,depth:.90,span:1.30,bottom:.55,dimensioned:true},
 {side:-1,x:-.45,z:11.52,depth:.90,span:1.00,bottom:.55,dimensioned:false},
 {side:-1,x:-.45,z:13.95,depth:.90,span:1.00,bottom:.55,dimensioned:false}
];
const roomData={
 ground:[
 {id:'g1',at:[3.4,3.55],poly:rect(.405,.405,6.425,6.305),surface:'wood'},
 {id:'g2',at:[8.55,4.65],poly:rect(6.625,2.645,10.475,6.305),surface:'wood'},
 {id:'g3',at:[8.8,8.95],poly:rect(7.135,6.705,10.475,10.995),surface:'wood'},
 {id:'g4',at:[5.22,9.45],poly:[[4.685,6.705],[6.735,6.705],[6.735,11.005],[3.015,11.005],[3.015,10.115],[3.215,10.115],[3.215,8.625],[4.685,8.625]],surface:'wood'},
 {id:'g5',at:[3.63,7.53],poly:rect(2.741,6.705,4.485,8.425),surface:'wood'},
 {id:'g6',at:[1.67,9.73],poly:[[.405,8.625],[3.015,8.625],[3.015,9.915],[2.815,9.915],[2.815,10.935],[.405,10.935]],surface:'tile'},
 {id:'g7',at:[.92,11.7],poly:rect(.405,11.105,1.405,12.905),surface:'tile'},
 {id:'g8',at:[2.97,11.77],poly:rect(1.535,11.105,4.575,12.525),surface:'tile'},
 {id:'g9',at:[2.1,13.75],poly:[[1.485,12.735],[3.355,12.735],[3.355,14.635],[.405,14.635],[.405,13.11],[1.485,13.11]],surface:'tile'},
 {id:'g10',at:[4.09,13.64],poly:rect(3.575,12.735,4.575,14.635),surface:'tile'},
 {id:'g11',at:[8.1,13.47],poly:rect(4.97,11.405,10.88,15.04),surface:'concrete'}
 ],
 basement:[
 {id:'b1',at:[3.35,3.62],poly:rect(.5,.5,6.4,6.3),surface:'concrete'},
 {id:'b2',at:[8.75,2.0],poly:rect(6.41,.5,10.38,2.54),surface:'concrete'},
 {id:'b3',at:[8.65,4.8],poly:rect(6.88,2.92,10.38,6.3),surface:'concrete'},
 {id:'b4',at:[3.73,7.65],poly:rect(.5,6.8,4.47,8.52),surface:'concrete'},
 {id:'b5',at:[2.51,11.73],poly:rect(.5,8.74,4.47,14.54),surface:'concrete'}
 ],
 upper:[
 {id:'u1',at:[5.75,7.20],poly:[[.405,.405],[5.25,.405],[5.25,2.645],[10.475,2.645],[10.475,10.795],[4.575,10.795],[4.575,14.705],[.405,14.705]],surface:'tile'},
 {id:'u2',at:[5.90,1.30],poly:rect(5.45,.20,6.425,2.34),surface:'concrete'}
 ]
};
function box(g,x,y,z,w,h,d,material){if(w<=0||h<=0||d<=0)return;const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function polygon(g,points,material,y=.022){const shape=new T.Shape();points.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));shape.closePath();const geo=new T.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);const m=new T.Mesh(geo,material);m.position.y=y;m.receiveShadow=true;g.add(m);return m;}
function walkBox(...args){const m=box(...args);if(m)m.userData.walkable=true;return m;}
function slab(g,x1,z1,x2,z2){walkBox(g,(x1+x2)/2,-.17,(z1+z2)/2,x2-x1,.32,z2-z1,mats.slab);}
function segment(g,x1,z1,x2,z2,h,t=.16,y=0,material=mats.wall,cap=true){const n=Math.hypot(x2-x1,z2-z1);const m=box(g,(x1+x2)/2,y+h/2,(z1+z2)/2,n,h,t,material);if(!m)return;m.rotation.y=-Math.atan2(z2-z1,x2-x1);if(cap){const c=box(g,(x1+x2)/2,y+h+.012,(z1+z2)/2,n,.024,t+.008,mats.cap);c.rotation.y=m.rotation.y;}return m;}
function addWallArea(g,spec){
 const length=Math.hypot(spec.x2-spec.x1,spec.z2-spec.z1),from=spec.from??0,to=spec.to??length;
 if(to<=from)return;
 const ux=(spec.x2-spec.x1)/length,uz=(spec.z2-spec.z1)/length;
 const grossArea=(to-from)*spec.height;
 const openingArea=spec.open.reduce((sum,[a,b,kind])=>{
  const width=Math.max(0,Math.min(to,b)-Math.max(from,a));
  const height=kind==='window'?1.32:kind==='door'?2.08:spec.height;
  return sum+width*Math.min(spec.height,height);
 },0);
 const area=Math.max(0,grossArea-openingArea),distance=(from+to)/2,offset=spec.thickness/2+.035;
 const normal=new T.Vector3(spec.normal[0],0,spec.normal[1]);
 const pos=new T.Vector3(spec.x1+ux*distance+normal.x*offset,spec.displayHeight>=2?spec.displayHeight-.32:spec.displayHeight*.63,spec.z1+uz*distance+normal.z*offset);
 const text=area.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' м²';
 const data={level:g.userData.level,kind:spec.kind||'Наружная стена',x1:spec.x1,z1:spec.z1,x2:spec.x2,z2:spec.z2,from,to,length:to-from,height:spec.height,grossArea,openingArea,area,normal:spec.normal};
 (g.userData.wallAreas||=[]).push(data);
 const el=document.createElement('div');el.className='bm-wall-area tabular-nums';el.textContent='≈ '+text;el.hidden=true;el.setAttribute('role','note');
 el.setAttribute('aria-label',levelNames[data.level]+', '+data.kind+': примерно '+text+', без оконных и дверных проёмов');
 $('bm-wall-labels').appendChild(el);wallLabels.push({g,el,pos,normal,data,spec});
}
function renderWallAreas(){
 for(const label of wallLabels)label.el.hidden=true;
 if(!state.wallAreas)return;
 const w=stage.clientWidth,h=stage.clientHeight,forward=camera.getWorldDirection(new T.Vector3());
 const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 const occluders=wallOccluders.filter(shown),ray=new T.Raycaster(),candidates=[];
 for(const label of wallLabels){
  if(!shown(label.g))continue;
  const anchor=label.pos.clone();if(state.showVentFacade&&label.data.level!=='basement')anchor.addScaledVector(label.normal,facadeConfig.airGap+facadeConfig.panelThickness);
  const point=label.g.localToWorld(anchor),normal=label.normal.clone().transformDirection(label.g.matrixWorld);
  const toCamera=camera.isPerspectiveCamera?camera.position.clone().sub(point).normalize():forward.clone().negate();
  if(normal.dot(toCamera)<.05)continue;
  const p=point.clone().project(camera);if(p.z<-1||p.z>1)continue;
  const x=(p.x+1)*w/2,y=(1-p.y)*h/2;
  ray.setFromCamera(new T.Vector2(p.x,p.y),camera);
  const distance=point.clone().sub(ray.ray.origin).dot(ray.ray.direction);
  ray.far=distance-.025;
  if(ray.far<=0||ray.intersectObjects(occluders,false).length)continue;
  label.el.hidden=false;
  const width=label.el.offsetWidth||84,height=label.el.offsetHeight||20;
  label.el.hidden=true;
  const bounds={left:x-width/2-3,right:x+width/2+3,top:y-height/2-2,bottom:y+height/2+2};
  if(bounds.left<2||bounds.right>w-2||bounds.top<2||bounds.bottom>h-2)continue;
  candidates.push({label,x,y,bounds,distance});
 }
 const occupied=[];
 for(const candidate of candidates.sort((a,b)=>a.distance-b.distance)){
  const b=candidate.bounds;
  if(occupied.some(a=>b.left<a.right&&b.right>a.left&&b.top<a.bottom&&b.bottom>a.top))continue;
  occupied.push(b);candidate.label.el.hidden=false;candidate.label.el.style.left=candidate.x+'px';candidate.label.el.style.top=candidate.y+'px';
 }
}
function wall(g,x1,z1,x2,z2,open=[],outer=false,thickness,facade){
 const len=Math.hypot(x2-x1,z2-z1), ux=(x2-x1)/len,uz=(z2-z1)/len, h=state.full?modelConfig.clearHeight:1.07,t=thickness||(outer?(g.userData.level==='basement'?.5:.405):.16);
 (g.userData.walls ||= []).push({x1,z1,x2,z2,open,thickness:t,height:h,facade});
 if(facade)addWallArea(g,{x1,z1,x2,z2,open,thickness:t,displayHeight:h,height:modelConfig.clearHeight,...facade});
 const part=(a,b,bottom=0,high=h-bottom)=>{const m=segment(g,x1+ux*a,z1+uz*a,x1+ux*b,z1+uz*b,high,t,bottom,mats.wall,bottom+high>=h-.001);if(m){m.userData.elementType=outer?'Наружная стена':'Стена';m.userData.baseScale=m.scale.clone();elementPicks.push(m);}return m;};
 let prev=0;
 open.sort((a,b)=>a[0]-b[0]).forEach(o=>{const [a,b,kind]=o;part(prev,a);if(kind==='window'){
  const sill=state.full?.8:.35,top=state.full?2.12:h;part(a,b,0,sill);if(h>top)part(a,b,top,h-top);
  const cx=x1+ux*(a+b)/2,cz=z1+uz*(a+b)/2,w=b-a;
  const win=new T.Group();win.position.set(cx,0,cz);win.rotation.y=-Math.atan2(uz,ux);g.add(win);
  box(win,0,sill+.025,0,w,.05,t+.08,mats.trim);box(win,0,top-.025,0,w,.05,.08,mats.trim);
  [-w/2+.03,0,w/2-.03].forEach(x=>box(win,x,(sill+top)/2,0,.055,top-sill,.075,mats.trim));
  {const wm=box(win,0,(sill+top)/2,0,w-.1,top-sill-.07,.025,mats.glass);wm.userData.elementType='Окно';wm.userData.baseScale=wm.scale.clone();elementPicks.push(wm);}
 }else if(kind==='door'){
  if(h>2.08)part(a,b,2.08,h-2.08);
  const dh=state.full?2.02:.98,dg=new T.Group();dg.userData.isDoor=true;dg.visible=state.showDoors;dg.position.set(x1+ux*a,0,z1+uz*a);dg.rotation.y=-Math.atan2(uz,ux)+.94;g.add(dg);
  {const dm=box(dg,(b-a-.09)/2,dh/2,0,b-a-.09,dh,.055,mats.door);dm.userData.elementType='Дверь';dm.userData.baseScale=dm.scale.clone();elementPicks.push(dm);}
  box(dg,b-a-.21,dh*.53,-.053,.12,.028,.045,mats.metal);
  if(state.full){[a,b].forEach(p=>segment(g,x1+ux*(p-.025),z1+uz*(p-.025),x1+ux*(p+.025),z1+uz*(p+.025),2.08,t+.025,0,mats.door,false));}
 }prev=b;});part(prev,len);
}
function rail(g,ax,ay,az,bx,by,bz,material=mats.door,r=.025){const a=new T.Vector3(ax,ay,az),b=new T.Vector3(bx,by,bz),v=b.clone().sub(a);const m=new T.Mesh(new T.CylinderGeometry(r,r,v.length(),7),material);m.position.copy(a.add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());m.castShadow=true;g.add(m);}
function flight(g,x,z,length,width,height,axis='x',wood=false){const n=14,sg=new T.Group();sg.position.set(x,0,z);if(axis==='z')sg.rotation.y=-Math.PI/2;g.add(sg);const material=wood?mats.door:mats.concrete;
 for(let i=0;i<n;i++){const sy=(i+1)*height/n;const st=walkBox(sg,(i+.5)*length/n,sy/2,0,length/n+.012,sy,width,material);st.userData.elementType='Лестница';st.userData.baseScale=st.scale.clone();elementPicks.push(st);if(i%2===0){rail(sg,(i+.5)*length/n,sy,-width/2,(i+.5)*length/n,sy+.72,-width/2);}}
 rail(sg,length/n/2,height/n+.72,-width/2,length-length/n/2,height+.72,-width/2);
 return sg;
}
function fixture(g,type,x,z,rotation=0){const f=new T.Group();f.position.set(x,0,z);f.rotation.y=rotation;g.add(f);
 if(type==='bath'){
  box(f,0,.28,0,.68,.56,1.62,mats.fixture);box(f,0,.565,0,.52,.035,1.4,mats.water);
  [-.31,.31].forEach(px=>box(f,px,.60,0,.075,.10,1.62,mats.fixture));[-.77,.77].forEach(pz=>box(f,0,.60,pz,.68,.10,.08,mats.fixture));
 }else if(type==='sink'){
  box(f,0,.37,0,.54,.74,.43,mats.fixture);box(f,0,.755,0,.39,.025,.29,mats.water);rail(f,0,.75,-.18,0,.94,-.18,mats.metal,.018);rail(f,0,.94,-.18,0,.94,-.08,mats.metal,.018);
 }else{
  const bowl=new T.Mesh(new T.SphereGeometry(.24,16,10),mats.fixture);bowl.scale.set(.9,.65,1.2);bowl.position.y=.37;f.add(bowl);box(f,0,.14,.025,.27,.28,.30,mats.fixture);box(f,0,.56,-.28,.44,.51,.16,mats.fixture);
  const seat=new T.Mesh(new T.TorusGeometry(.18,.038,6,20),mats.fixture);seat.rotation.x=Math.PI/2;seat.scale.y=1.2;seat.position.y=.48;f.add(seat);
 }
}
function label(g,r){const el=document.createElement('div');el.className='bm-tag';const n=roomData[g.userData.level].indexOf(r)+1;el.textContent=n;labelLayer.appendChild(el);labels.push({el,g,r,pos:new T.Vector3(r.at[0],.12,r.at[1])});}
function addRoom(g,r){const m=polygon(g,r.poly,mats[r.surface]);m.userData.room=r;m.userData.walkable=true;m.userData.level=g.userData.level;picks.push(m);label(g,r);}
function makeGround(g){
 slab(g,0,0,6.425,6.505);slab(g,6.425,0,10.88,.405);slab(g,10.475,.405,10.88,2.545);slab(g,6.425,2.545,10.88,6.505);
 slab(g,0,6.505,10.88,6.705);slab(g,2.741,6.705,10.88,8.425);slab(g,0,6.705,.405,8.425);slab(g,0,8.425,10.88,15.04);
 roomData.ground.forEach(r=>addRoom(g,r));
 wall(g,0,.2025,10.88,.2025,[[3.0,5.24,'window']],true,undefined,{normal:[0,-1]});
 wall(g,.2025,.405,.2025,15.04,[[3.93,4.76,'window'],[6.91,7.71,'window'],[8.62,9.20,'window']],true,undefined,{normal:[-1,0]});
 wall(g,10.6775,.405,10.6775,11.40,[[.80,1.43,'window'],[3.35,4.83,'window'],[6.80,9.95,'window']],true,undefined,{normal:[1,0]});
 wall(g,0,14.8375,4.97,14.8375,[],true,undefined,{normal:[0,1]});
 wall(g,4.7775,11.405,4.7775,15.04,[[.22,.90,'window']],true,undefined,{normal:[1,0]});
 wall(g,6.525,2.645,6.525,6.305,[[2.08,3.15,'door']],false,.20);
 wall(g,6.425,2.595,10.475,2.595,[],false,.10);
 wall(g,0,6.505,10.88,6.505,[[4.84,6.21,'open']],false,.4);
 wall(g,6.935,6.705,6.935,10.995,[[.46,1.30,'door'],[3.16,4.06,'window']],false,.40);
 wall(g,.405,8.525,4.685,8.525,[[2.82,3.44,'door']],false,.20);
 wall(g,4.585,6.705,4.585,8.425,[],false,.20);
 wall(g,3.115,8.625,3.115,10.015,[],false,.20);
 wall(g,2.815,10.015,3.215,10.015,[],false,.20);
 wall(g,2.915,10.115,2.915,10.935,[],false,.20);
 wall(g,.405,11.02,4.575,11.02,[[1.42,2.15,'door'],[2.94,3.73,'door']],false,.17);
 wall(g,1.47,11.93,1.47,12.99,[],false,.13);
 wall(g,.405,13.0075,1.485,13.0075,[],false,.205);
 wall(g,1.485,12.63,4.575,12.63,[[.30,1.04,'door'],[2.20,2.96,'door']],false,.21);
 wall(g,3.465,12.735,3.465,14.635,[],false,.22);
 wall(g,4.97,11.205,7.135,11.205,[[.08,1.26,'door']],false,.40,{normal:[0,1]});
 wall(g,7.135,11.1975,10.88,11.1975,[[.42,2.91,'window']],false,.405,{normal:[0,1]});
 box(g,10.68,.52,14.84,.40,1.04,.40,mats.wall);box(g,6.85,.20,14.84,.40,.40,.40,mats.slab);
 const down=flight(g,.72,7.26,1.90,.91,1.50,'x',true);down.position.y=-1.50;
 g.userData.lowerStairPreview=down;
 rail(g,2.65,.06,6.75,2.65,.86,6.75);rail(g,2.65,.86,6.75,2.65,.86,8.31);rail(g,2.65,.06,8.31,2.65,.86,8.31);
 walkBox(g,6.50,-.06,2.00,.16,.12,.91,mats.concrete);
 const first=flight(g,6.55,2.00,2.73,.91,1.50,'x',true);
 walkBox(g,9.83,1.44,1.48,1.12,.12,1.93,mats.door);
 const second=flight(g,9.29,.95,2.73,.91,1.50,'x',true);second.position.y=1.50;second.rotation.y=Math.PI;
 fixture(g,'bath',2.87,13.71);fixture(g,'sink',1.88,14.30,Math.PI);fixture(g,'toilet',.79,13.50,-Math.PI/2);
 fixture(g,'toilet',4.05,14.22);fixture(g,'sink',4.28,13.08,Math.PI/2);
 box(g,.93,.075,12.35,.77,.15,.78,mats.fixture);box(g,.93,.155,12.35,.64,.02,.64,mats.water);
 box(g,2.35,.42,8.93,.60,.84,.48,mats.trim);box(g,2.35,.78,8.93,.48,.07,.35,mats.metal);
 const entrance=new T.Group();g.add(entrance);g.userData.entrance=entrance;
 entrance.userData={steps:5,rise:.20,tread:.32,width:1.62,frontZ:15.04,totalRise:1};
 for(let i=0;i<5;i++){
  const height=(i+1)*.20;
  const step=walkBox(entrance,5.79,-1+height/2,15.04+(4.5-i)*.32,1.62,height,.32,mats.concrete);
  step.userData.step=i+1;
 }
}
function makeBasement(g){
 slab(g,0,0,10.88,6.8);slab(g,0,6.8,4.97,15.04);slab(g,4.97,6.8,7.14,11.49);
 roomData.basement.forEach(r=>addRoom(g,r));
 wall(g,0,.25,10.88,.25,[],true,undefined,{normal:[0,-1]});
 wall(g,.25,.5,.25,15.04,[[4.34,5.32,'window'],[10.72,11.32,'window'],[13.14,13.76,'window']],true,undefined,{normal:[-1,0]});
 wall(g,10.63,.5,10.63,6.55,[[4.35,5.31,'window']],true,undefined,{normal:[1,0]});
 wall(g,0,6.55,10.88,6.55,[],true,undefined,{normal:[0,1],from:7.14});
 wall(g,0,14.79,4.97,14.79,[],true,undefined,{normal:[0,1]});
 wall(g,4.72,6.8,4.72,15.04,[],true,undefined,{normal:[1,0],from:4.69});
 wall(g,6.64,2.54,6.64,6.3,[],false,.48);
 wall(g,6.88,2.73,10.38,2.73,[[.06,.99,'door']],false,.38);
 wall(g,.5,8.63,4.47,8.63,[[3.00,3.79,'door']],false,.22);
 polygon(g,rect(4.97,6.8,7.14,11.49),mats.concrete,.025);
 wall(g,6.89,6.8,6.89,11.49,[],true,undefined,{normal:[1,0]});wall(g,4.97,11.24,7.14,11.24,[],true,undefined,{normal:[0,1]});
 for(let z=7.02;z<11.18;z+=.2)segment(g,5.05,z,6.61,z,.035,.025,.14,mats.metal,false);
 for(let x=5.06;x<6.65;x+=.21)segment(g,x,6.96,x,11.21,.035,.025,.14,mats.metal,false);
 box(g,5.84,.22,9.02,.72,.14,3.20,mats.slab);box(g,5.84,.30,9.02,.53,.02,3.02,mats.concrete);
 const up=flight(g,6.5,.98,2.75,.96,3.0,'x');
 const lower=flight(g,2.75,8.06,1.93,.82,1.5,'x');lower.rotation.y=Math.PI;
 walkBox(g,.87,1.44,7.64,.73,.12,1.70,mats.concrete);
 const upper=flight(g,.87,7.23,1.88,.82,1.5,'x');upper.position.y=1.5;
 g.userData.windowWells=windowWells;
 for(const well of windowWells){
  const {x,z,side,depth,span,bottom}=well,top=siteConfig.gradeY+.06,t=.12;
  box(g,x,bottom-.06,z,depth,.12,span,mats.concrete);
  box(g,x+side*(depth/2-t/2),(bottom+top)/2,z,t,top-bottom,span,mats.concrete);
  for(const edge of [-1,1])box(g,x,(bottom+top)/2,z+edge*(span/2-t/2),depth,top-bottom,t,mats.concrete);
 }
}
function makeTerrain(){
 const g=new T.Group();g.position.set(-5.44,0,-7.52);g.name='Hypothetical ground, 5 m perimeter';
 const cutout=[[0,0],[10.88,0],[10.88,4.68],[11.78,4.68],[11.78,5.98],[10.88,5.98],[10.88,6.8],[7.14,6.8],[7.14,11.49],[4.97,11.49],[4.97,15.04],[0,15.04],[0,14.45],[-.90,14.45],[-.90,13.45],[0,13.45],[0,12.02],[-.90,12.02],[-.90,11.02],[0,11.02],[0,5.98],[-.90,5.98],[-.90,4.68],[0,4.68]];
 const b=siteConfig.outerBounds,outline=rect(b.minX,b.minZ,b.maxX,b.maxZ),shape=new T.Shape();
 outline.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));shape.closePath();
 const hole=new T.Path();cutout.forEach((p,i)=>i?hole.lineTo(p[0],-p[1]):hole.moveTo(p[0],-p[1]));hole.closePath();shape.holes.push(hole);
 const geo=new T.ExtrudeGeometry(shape,{depth:siteConfig.gradeY-siteConfig.bottomY,bevelEnabled:false,steps:1,curveSegments:1});geo.rotateX(-Math.PI/2);
 const soil=new T.Mesh(geo,[mats.terrainTop,mats.terrainSide]);soil.userData.walkable=true;soil.position.y=siteConfig.bottomY;soil.receiveShadow=true;soil.castShadow=true;g.add(soil);
 g.userData={gradeY:siteConfig.gradeY,margin:siteConfig.margin,outerBounds:b,cutout,soil};scene.add(g);return g;
}
function makeFoundation(){
 const g=new T.Group();g.name='Фундамент пристроек';g.position.set(-5.44,0,-7.52);
 const bottom=-.33,top=modelConfig.structuralHeight-.33;
 const parts=[[7.14,6.80,10.88,11.49],[4.97,11.49,10.88,15.04]];
 for(const [x1,z1,x2,z2] of parts)box(g,(x1+x2)/2,(bottom+top)/2,(z1+z2)/2,x2-x1,top-bottom,z2-z1,mats.foundation);
 g.userData={bottom,top,parts};scene.add(g);return g;
}
function makeAvatar(){
 const g=new T.Group();g.name='Персонаж 185 см';g.userData={height:walker.height,eyeHeight:walker.eyeHeight};
 box(g,0,1.20,0,.40,.56,.23,mats.clothes);box(g,0,1.52,0,.12,.08,.13,mats.skin);
 const head=new T.Mesh(new T.SphereGeometry(.14,18,12),mats.skin);head.position.y=1.71;head.castShadow=true;g.add(head);g.userData.head=head;
 const limbs=[];
 for(const side of [-1,1]){
  const leg=new T.Group();leg.position.set(side*.105,.92,0);g.add(leg);box(leg,0,-.42,0,.16,.84,.17,mats.clothes);box(leg,0,-.88,-.035,.18,.08,.28,mats.metal);limbs.push(leg);
  const arm=new T.Group();arm.position.set(side*.27,1.43,0);g.add(arm);box(arm,0,-.23,0,.12,.48,.14,mats.clothes);box(arm,0,-.53,0,.11,.15,.12,mats.skin);limbs.push(arm);
 }
 g.userData.limbs=limbs;scene.add(g);g.position.copy(walker.position);return g;
}
function syncWalker(){
 if(!avatarGroup)return;
 avatarGroup.position.copy(walker.position);avatarGroup.userData.head.visible=!state.walk;
 if(state.walk){avatarGroup.rotation.y=freeAngles.y;freeCamera.position.copy(walker.position);freeCamera.position.y+=walker.eyeHeight;}
}
function updateGroundColor(hex){
 if(!/^#[0-9a-f]{6}$/i.test(hex))return;
 state.groundColor=hex;const color=new T.Color(hex),hue=Math.round(color.getHSL({},T.SRGBColorSpace).h*360);
 mats.terrainTop.color.copy(color);mats.terrainSide.color.copy(color).lerp(palette.fg,.35);
 $('bm-ground-color').value=hex;$('bm-ground-hue').value=String(hue);$('bm-ground-hue-value').textContent=hue+'°';
 if(terrainGroup)render();
}
$('bm-ground-color').addEventListener('input',e=>updateGroundColor(e.target.value));
$('bm-ground-hue').addEventListener('input',e=>{
 const hsl=new T.Color(state.groundColor).getHSL({},T.SRGBColorSpace),color=new T.Color().setHSL(Number(e.target.value)/360,Math.max(hsl.s,.3),hsl.l,T.SRGBColorSpace);
 updateGroundColor('#'+color.getHexString());
});
function refreshPhysics(){
 physics.surfaces=[];physics.solids=[];scene.updateMatrixWorld(true);
 for(const g of [...Object.values(groups),foundationGroup]){
  g.traverse(o=>{
   if(!o.isMesh)return;
   let p=o,isDoor=false;while(p&&p!==g){if(p.userData.isVentFacade)return;if(p.userData.isDoor)isDoor=true;if(p===groups.upper.userData.stairPreview||p===groups.ground.userData.lowerStairPreview)return;p=p.parent;}
   if(o.userData.walkable)physics.surfaces.push(o);
   if(o.geometry.type==='ShapeGeometry')return;
   o.geometry.computeBoundingBox();const scale=new T.Vector3();o.getWorldScale(scale);
   physics.solids.push({mesh:o,door:isDoor,bounds:new T.Box3().setFromObject(o),inverse:o.matrixWorld.clone().invert(),box:o.geometry.boundingBox.clone().expandByScalar(walker.radius/Math.min(scale.x,scale.y,scale.z))});
  });
 }
 physics.surfaces.push(terrainGroup.userData.soil);
}
function supportAt(x,z,y){
 for(const [sx,sz] of [[0,0],[.0001,0],[-.0001,0],[0,.0001],[0,-.0001]]){
 const ray=new T.Raycaster(new T.Vector3(x+sx,y+walker.maxStep+.015,z+sz),new T.Vector3(0,-1,0),0,walker.maxStep+.30);
 const hits=ray.intersectObjects(physics.surfaces,false);
 for(const hit of hits){
  if(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y<.7)continue;
  if(hit.point.y<=y+walker.maxStep+.002&&hit.point.y>=y-.27)return hit.point.y;
 }
 }
 return null;
}
function segmentInBox(a,b,box){
 let near=0,far=1;
 for(const axis of ['x','y','z']){
  const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<box.min[axis]||a[axis]>box.max[axis])return false;continue;}
  let lo=(box.min[axis]-a[axis])/d,hi=(box.max[axis]-a[axis])/d;if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);if(near>far)return false;
 }
 return true;
}
function blockedAt(x,z,y){
 const r=walker.radius;
 for(const solid of physics.solids){
  if(solid.door&&!state.showDoors)continue;
  const b=solid.bounds;
  if(b.max.y<=y+walker.maxStep+.012||b.min.y>=y+walker.height||x+r<b.min.x||x-r>b.max.x||z+r<b.min.z||z-r>b.max.z)continue;
  const a=new T.Vector3(x,y+r,z).applyMatrix4(solid.inverse),c=new T.Vector3(x,y+walker.height-r,z).applyMatrix4(solid.inverse);
  if(segmentInBox(a,c,solid.box))return true;
 }
 return false;
}
function tryWalk(dx,dz){
 const x=walker.position.x+dx,z=walker.position.z+dz,b=siteConfig.outerBounds,r=walker.radius;
 if(x<b.minX-5.44+r||x>b.maxX-5.44-r||z<b.minZ-7.52+r||z>b.maxZ-7.52-r)return false;
 const y=supportAt(x,z,walker.position.y);if(y===null||blockedAt(x,z,y))return false;
 walker.position.set(x,y,z);return true;
}
function moveWalker(forward,right){
 if(!state.walk||!Number.isFinite(forward+right))return;
 const yaw=freeAngles.y,dx=-Math.sin(yaw)*forward+Math.cos(yaw)*right,dz=-Math.cos(yaw)*forward-Math.sin(yaw)*right;
 const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.065)),start=walker.position.clone();
 for(let i=0;i<count;i++){if(!tryWalk(dx/count,dz/count)){if(dx)tryWalk(dx/count,0);if(dz)tryWalk(0,dz/count);}}
 const distance=walker.position.distanceTo(start);walker.phase+=distance*7;
 avatarGroup.userData.limbs.forEach((limb,i)=>limb.rotation.x=distance>0?Math.sin(walker.phase+(i%2?Math.PI:0)+(i>1?Math.PI:0))*.2:0);
 syncWalker();render();
}
const walkKeys=new Set();let walkFrameId=0,lastWalkTime=0,walkFast=false;
function stopWalkKeys(){walkKeys.clear();if(walkFrameId)cancelAnimationFrame(walkFrameId);walkFrameId=0;lastWalkTime=0;if(avatarGroup)avatarGroup.userData.limbs.forEach(l=>l.rotation.x=0);}
function walkFrame(time){
 walkFrameId=0;if(!state.walk||!walkKeys.size){lastWalkTime=0;return;}
 const dt=lastWalkTime?Math.min((time-lastWalkTime)/1000,.05):1/60;lastWalkTime=time;
 const pressed=(...keys)=>keys.some(k=>walkKeys.has(k))?1:0;
 let f=pressed('KeyW','ArrowUp')-pressed('KeyS','ArrowDown'),r=pressed('KeyD','ArrowRight')-pressed('KeyA','ArrowLeft');
 const n=Math.hypot(f,r)||1,speed=walkFast?3.4:2;moveWalker(f/n*speed*dt,r/n*speed*dt);walkFrameId=requestAnimationFrame(walkFrame);
}
function startWalkKey(code,fast){walkKeys.add(code);walkFast=fast;if(!walkFrameId)walkFrameId=requestAnimationFrame(walkFrame);}
document.addEventListener('keyup',e=>{walkKeys.delete(e.code);walkFast=e.shiftKey;if(!walkKeys.size)stopWalkKeys();});
window.addEventListener('blur',stopWalkKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopWalkKeys();});
function setWalk(active){
 if(active===state.walk)return;stopWalkKeys();
 if(active){
  if(state.freeCamera)setFreeCamera(false);
  state.walk=true;state.floor='both';state.explode=false;state.top=false;state.showTerrain=true;state.showBasement=true;
  $('bm-top').checked=false;$('bm-explode').checked=false;
  const rebuild=!state.full;state.full=true;$('bm-full').checked=true;
  camera=freeCamera;freeCamera.fov=60;freeAngles.set(0,0,0,'YXZ');freeCamera.quaternion.setFromEuler(freeAngles);
  if(rebuild)build();else applyState();refreshPhysics();
 }else{
  state.walk=false;camera=orbitCamera;freeCamera.fov=45;avatarGroup.userData.head.visible=true;avatarGroup.userData.limbs.forEach(l=>l.rotation.x=0);applyState();
 }
 $('bm-walk').textContent=active?'Выйти из прогулки':'Прогулка с персонажем';$('bm-walk').setAttribute('aria-pressed',String(active));
 $('bm-free-controls').hidden=!active;$('bm-up').hidden=active;$('bm-down').hidden=active;$('bm-top').disabled=active;
 $('bm-movement-help').textContent='Персонаж 1,85 м · камера 1,75 м над поверхностью. WASD / стрелки — ходьба · мышь — осмотр · Shift — быстрее. На телефоне используйте кнопки и перетаскивание.';
 fit();
}
$('bm-walk').addEventListener('click',()=>setWalk(!state.walk));
function makeUpper(g){
 const outline=[[0,0],[10.88,0],[10.88,11.195],[4.97,11.195],[4.97,15.04],[0,15.04]];
 g.userData.outline=outline;
 slab(g,0,0,6.425,2.54);slab(g,6.425,0,10.88,.405);
 slab(g,10.475,.405,10.88,2.54);slab(g,6.425,2.34,10.475,2.54);
 slab(g,0,2.54,10.88,11.195);slab(g,0,11.195,4.97,15.04);
 roomData.upper.forEach(r=>addRoom(g,r));
 wall(g,5.25,.10,10.88,.10,[],false,.20,{normal:[0,-1]});
 wall(g,5.35,.20,5.35,2.54,[[.84,1.84,'door']],false,.20,{normal:[-1,0]});
 wall(g,5.25,2.44,10.88,2.44,[],false,.20,{normal:[0,1]});
 wall(g,10.78,.20,10.78,2.34,[[.68,1.32,'window']],false,.20,{normal:[1,0]});
 const parapet=new T.Group();g.add(parapet);g.userData.parapet=parapet;
 parapet.userData={height:1,thickness:.18};
 const edge=[[.20,.20],[5.25,.20],[5.25,2.44],[10.68,2.44],[10.68,10.995],[4.775,10.995],[4.775,14.84],[.20,14.84],[.20,.20]];
 for(let i=0;i<edge.length-1;i++){
  if(i===1||i===2)continue;
  const [a,b]=[edge[i],edge[i+1]];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  addWallArea(g,{x1:a[0],z1:a[1],x2:b[0],z2:b[1],open:[],height:1,displayHeight:1,thickness:.18,normal:[(b[1]-a[1])/length,-(b[0]-a[0])/length],kind:'Парапет'});
  segment(parapet,...a,...b,1,.18,0,mats.wall,false);
  segment(parapet,...a,...b,.024,.188,.976,mats.cap,false);
 }
 walkBox(g,6.50,-.06,.95,.16,.12,.91,mats.concrete);
 g.userData.posts=[]; // Roof cover and its eight supports removed at the owner's request.
 const preview=new T.Group();preview.position.y=-3;g.add(preview);g.userData.stairPreview=preview;
 flight(preview,6.55,2.00,2.73,.91,1.50,'x',true);
 walkBox(preview,9.83,1.44,1.48,1.12,.12,1.93,mats.door);
 const up=flight(preview,9.29,.95,2.73,.91,1.50,'x',true);up.position.y=1.50;up.rotation.y=Math.PI;
}
let overlay;
const facadeConfig={airGap:.05,panelThickness:.012,joint:.008,minSize:.30,maxSize:1.20};
function subtractFacadeOpening(rect,hole){
 const u0=Math.max(rect.u0,hole.u0),u1=Math.min(rect.u1,hole.u1),y0=Math.max(rect.y0,hole.y0),y1=Math.min(rect.y1,hole.y1);
 if(u1<=u0||y1<=y0)return [rect];
 return [
  {u0:rect.u0,u1,y0:rect.y0,y1:y0},
  {u0:rect.u0,u1:u0,y0:y0,y1:rect.y1},
  {u0:u1,u1:rect.u1,y0:rect.y0,y1:rect.y1},
  {u0:u0,u1:u1,y0:y1,y1:rect.y1}
 ].filter(r=>r.u1-r.u0>1e-5&&r.y1-r.y0>1e-5);
}
function cutFacadeRect(rect,holes){return holes.reduce((pieces,hole)=>pieces.flatMap(piece=>subtractFacadeOpening(piece,hole)),[rect]);}
function facadeInstances(parent,spec,rects,material,depth,offset,kind){
 if(!rects.length)return;
 const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material,rects.length);
 const length=Math.hypot(spec.x2-spec.x1,spec.z2-spec.z1),ux=(spec.x2-spec.x1)/length,uz=(spec.z2-spec.z1)/length;
 const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-Math.atan2(uz,ux));
 const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3();
 for(let i=0;i<rects.length;i++){
  const r=rects[i],u=(r.u0+r.u1)/2;
  position.set(spec.x1+ux*u+spec.normal[0]*offset,(r.y0+r.y1)/2,spec.z1+uz*u+spec.normal[1]*offset);
  scale.set(r.u1-r.u0,r.y1-r.y0,depth);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
 }
 mesh.name=kind;mesh.userData={facadeKind:kind,rects,offset,depth};mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;
 mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);return mesh;
}
function buildVentFacades(){
 for(const level of ['ground','upper']){
  const g=groups[level],old=g.userData.ventFacade;
  if(old){g.remove(old);old.traverse(o=>o.geometry?.dispose());}
  const cladding=new T.Group();cladding.name='Вентилируемый фасад · '+levelNames[level];cladding.userData={isVentFacade:true,panelCount:0,panelSize:state.panelSize};
  cladding.visible=state.showVentFacade;g.add(cladding);g.userData.ventFacade=cladding;
  for(const label of wallLabels.filter(l=>l.g===g)){
   const spec=label.spec,length=Math.hypot(spec.x2-spec.x1,spec.z2-spec.z1),from=spec.from??0,to=spec.to??length,height=spec.displayHeight;
   const clear=.012,holes=spec.open.map(([a,b,kind])=>({u0:a-clear,u1:b+clear,y0:kind==='window'?(state.full?.8:.35)-clear:-clear,y1:kind==='window'?Math.min(height,state.full?2.12:height)+clear:Math.min(height,kind==='door'?2.08:height)+clear}));
   const wall=new T.Group();wall.userData={isVentFacade:true,spec,holes};cladding.add(wall);
   const pitch=state.panelSize,joint=facadeConfig.joint,panels=[];
   for(let col=Math.floor(from/pitch);col<Math.ceil(to/pitch);col++)for(let row=0;row<Math.ceil(height/pitch);row++){
    const rect={u0:Math.max(from,col*pitch)+joint/2,u1:Math.min(to,(col+1)*pitch)-joint/2,y0:row*pitch+joint/2,y1:Math.min(height,(row+1)*pitch)-joint/2};
    if(rect.u1<=rect.u0||rect.y1<=rect.y0)continue;
    panels.push(...cutFacadeRect(rect,holes));
   }
   const backing=cutFacadeRect({u0:from,u1:to,y0:0,y1:height},holes),rails=[];
   for(let u=from+.025;u<to-.015;u+=pitch)rails.push(...cutFacadeRect({u0:u-.018,u1:Math.min(to,u+.018),y0:0,y1:height},holes));
   const face=spec.thickness/2;
   facadeInstances(wall,spec,backing,mats.facadeBacking,.002,face+.002,'Подложка');
   facadeInstances(wall,spec,rails,mats.metal,.030,face+.025,'Направляющие');
   facadeInstances(wall,spec,panels,mats.facadePanel,facadeConfig.panelThickness,face+facadeConfig.airGap+facadeConfig.panelThickness/2,'Плиты');
   cladding.userData.panelCount+=panels.length;
  }
 }
}
function refreshWallOccluders(){wallOccluders=[];for(const g of [...Object.values(groups),terrainGroup,foundationGroup])g.traverse(o=>{if(o.isMesh)wallOccluders.push(o);});}
function syncFacadeControls(){
 $('bm-facade-toggle').textContent=state.showVentFacade?'Скрыть вентфасад':'Показать вентфасад';$('bm-facade-toggle').setAttribute('aria-pressed',String(state.showVentFacade));
 const size=Math.round(state.panelSize*1000),text=size+' × '+size+' мм';$('bm-panel-size-value').textContent=text;$('bm-panel-size').setAttribute('aria-valuetext',text);
 for(const level of ['ground','upper'])if(groups[level]?.userData.ventFacade)groups[level].userData.ventFacade.visible=state.showVentFacade;
}
$('bm-facade-toggle').addEventListener('click',()=>{state.showVentFacade=!state.showVentFacade;syncFacadeControls();render();});
$('bm-facade-color').addEventListener('input',e=>{if(!/^#[0-9a-f]{6}$/i.test(e.target.value))return;state.facadeColor=e.target.value;setFacadeMaterial(state.facadeMaterial);render();});
function setFacadeMaterial(name){
 const allowed=['panel','plaster','brick','wood','metal'];if(!allowed.includes(name))name='panel';state.facadeMaterial=name;
 if(mats.facadePanel.map){mats.facadePanel.map.dispose();mats.facadePanel.map=null;}
 const base=new T.Color(state.facadeColor);mats.facadePanel.color.copy(base);mats.facadePanel.metalness=0;mats.facadePanel.roughness=.62;
 if(name==='plaster'){mats.facadePanel.roughness=.92;mats.facadePanel.map=texture('concrete',base);}
 else if(name==='brick'){mats.facadePanel.color.copy(base.clone().offsetHSL(.01,.18,-.06));mats.facadePanel.roughness=.86;mats.facadePanel.map=texture('tile',mats.facadePanel.color);mats.facadePanel.map.repeat.set(7,4);}
 else if(name==='wood'){mats.facadePanel.color.copy(base.clone().offsetHSL(.035,.08,-.02));mats.facadePanel.roughness=.72;mats.facadePanel.map=texture('wood',mats.facadePanel.color);mats.facadePanel.map.repeat.set(4,6);}
 else if(name==='metal'){mats.facadePanel.roughness=.28;mats.facadePanel.metalness=.72;}
 else mats.facadePanel.map=texture('concrete',new T.Color(0xffffff));
 mats.facadePanel.needsUpdate=true;render();
}
function setComparison(value){state.comparison=T.MathUtils.clamp(Number(value)||0,0,1);const a=state.comparison;for(const level of ['ground','upper']){const f=groups[level]?.userData.ventFacade;if(!f)continue;f.visible=state.showVentFacade&&a>.01;f.traverse(o=>{if(!o.isMesh)return;if(o.userData.facadeKind==='Плиты'){o.material.transparent=a<.995;o.material.opacity=Math.max(.08,a);o.material.depthWrite=a>.45;}else if(o.userData.facadeKind)o.visible=a>.33;});}render();}
function facadeArea(){return wallLabels.filter(x=>x.data.level!=='basement').reduce((sum,x)=>sum+x.data.area,0);}
function panelCount(){return ['ground','upper'].reduce((sum,l)=>sum+(groups[l]?.userData.ventFacade?.userData.panelCount||0),0);}
function elementInfo(mesh=selectedElement){if(!mesh)return null;mesh.geometry?.computeBoundingBox();const b=new T.Box3().setFromObject(mesh),size=b.getSize(new T.Vector3()),base=mesh.userData.baseScale||new T.Vector3(1,1,1),mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;return {type:mesh.userData.elementType||'Элемент',size:{x:size.x,y:size.y,z:size.z},visible:mesh.visible,scale:{x:mesh.scale.x/(base.x||1),y:mesh.scale.y/(base.y||1),z:mesh.scale.z/(base.z||1)},color:mat?.color?'#'+mat.color.getHexString():'#cccccc',materialPreset:mesh.userData.materialPreset||'original'};}
function selectElement(mesh){selectedElement=mesh||null;root.dispatchEvent(new CustomEvent('dom3d-element-selected',{detail:elementInfo()}));}
function localElementMaterial(mesh){if(!mesh.userData.originalMaterial)mesh.userData.originalMaterial=mesh.material;if(!mesh.userData.localMaterial){mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();mesh.userData.localMaterial=true;}return Array.isArray(mesh.material)?mesh.material[0]:mesh.material;}
function styleSelectedElement(preset='original',color){if(!selectedElement)return;if(preset==='original'&&selectedElement.userData.originalMaterial){selectedElement.material=selectedElement.userData.originalMaterial;selectedElement.userData.localMaterial=false;selectedElement.userData.materialPreset='original';}else{const m=localElementMaterial(selectedElement);selectedElement.userData.materialPreset=preset;if('metalness' in m)m.metalness=preset==='metal'?.82:preset==='wood'?.05:0;if('roughness' in m)m.roughness=preset==='metal'?.25:preset==='glass'?.12:preset==='wood'?.74:.88;if(preset==='glass'){m.transparent=true;m.opacity=.42;m.depthWrite=false;}else{m.transparent=false;m.opacity=1;m.depthWrite=true;}if(m.color){if(color&&/^#[0-9a-f]{6}$/i.test(color))m.color.set(color);else if(preset==='wood')m.color.set('#8b633d');else if(preset==='metal')m.color.set('#9ca4aa');else if(preset==='masonry')m.color.set('#d8d0c4');}m.needsUpdate=true;}render();}
function updateSelectedElement({visible,scaleX,scaleY,scaleZ,color,materialPreset,remove}={}){if(!selectedElement)return;if(typeof visible==='boolean')selectedElement.visible=visible;if(remove===true)selectedElement.visible=false;const base=selectedElement.userData.baseScale||new T.Vector3(1,1,1);if(Number.isFinite(scaleX))selectedElement.scale.x=base.x*scaleX;if(Number.isFinite(scaleY))selectedElement.scale.y=base.y*scaleY;if(Number.isFinite(scaleZ))selectedElement.scale.z=base.z*scaleZ;if(materialPreset||color)styleSelectedElement(materialPreset||selectedElement.userData.materialPreset||'custom',color);refreshPhysics();render();selectElement(selectedElement);}

$('bm-panel-size').addEventListener('input',e=>{
 const value=Number(e.target.value)/1000;if(!Number.isFinite(value))return;
 state.panelSize=T.MathUtils.clamp(Math.round(value/.05)*.05,facadeConfig.minSize,facadeConfig.maxSize);
 buildVentFacades();refreshWallOccluders();syncFacadeControls();render();
});
function build(){
 Object.values(groups).forEach(g=>{scene.remove(g);g.traverse(o=>{if(o.geometry)o.geometry.dispose();});});
 for(const g of [terrainGroup,foundationGroup,avatarGroup])if(g){scene.remove(g);g.traverse(o=>o.geometry?.dispose());}
 wallLabels.splice(0).forEach(l=>l.el.remove());
 labels.splice(0).forEach(l=>l.el.remove());picks.splice(0);elementPicks.splice(0);selectedElement=null;
 for(const [name,make] of [['ground',makeGround],['basement',makeBasement],['upper',makeUpper]]){const g=new T.Group();g.position.set(-5.44,0,-7.52);g.userData.level=name;scene.add(g);groups[name]=g;make(g);}
 terrainGroup=makeTerrain();foundationGroup=makeFoundation();avatarGroup=makeAvatar();
 buildVentFacades();refreshWallOccluders();
 overlay=null;applyState();if(state.walk)refreshPhysics();
}
function rebuildRooms(){
 const options=['<option value="">Все зоны</option>'];
 for(const level of ['basement','ground','upper'])if(groups[level].visible){roomData[level].forEach((r,i)=>options.push('<option value="'+level+':'+r.id+'">'+(state.floor==='both'?levelNames[level]+' · ':'')+'Зона '+(i+1)+'</option>'));}
 $('bm-room').innerHTML=options.join('');$('bm-room').value=state.selected;
}
function selectRoom(key){
 state.selected=key;if(overlay){overlay.parent.remove(overlay);overlay.geometry.dispose();overlay=null;}
 const [level,id]=(key||'').split(':'),r=roomData[level]?.find(r=>r.id===id);
 if(r){overlay=polygon(groups[level],r.poly,mats.highlight,.055);const n=roomData[level].indexOf(r)+1;$('bm-info').textContent=levelNames[level]+' · зона '+n;}
 else $('bm-info').textContent=state.floor==='basement'&&!groups.basement.visible?'Цокольный этаж скрыт':state.floor==='ground'?'1 этаж':state.floor==='basement'?'Цоколь':state.floor==='upper'?'2 этаж / крыша':(state.explode?'Разнесённый вид':'Единая конструкция');
 $('bm-room').value=key;render();
}
function applyState(){
 syncFacadeControls();
 const together=state.floor==='both',gap=state.explode?5.4:modelConfig.structuralHeight;
 for(const [level,index] of [['basement',0],['ground',1],['upper',2]]){groups[level].visible=(together||state.floor===level)&&(level!=='basement'||state.showBasement);groups[level].position.y=index*(together?gap:modelConfig.structuralHeight);}
 terrainGroup.visible=state.showTerrain;foundationGroup.visible=state.showFoundation;
 Object.values(groups).forEach(g=>g.traverse(o=>{if(o.userData.isDoor)o.visible=state.showDoors;}));
 $('bm-wall-areas').textContent=state.wallAreas?'Скрыть площади стен':'Показать площади стен';$('bm-wall-areas').setAttribute('aria-pressed',String(state.wallAreas));$('bm-wall-area-note').hidden=!state.wallAreas;
 $('bm-doors-toggle').textContent=state.showDoors?'Скрыть двери':'Показать двери';$('bm-doors-toggle').setAttribute('aria-pressed',String(state.showDoors));
 if(state.selected&&!groups[state.selected.split(':')[0]]?.visible)state.selected='';
 groups.upper.userData.stairPreview.visible=!together||state.explode;
 groups.ground.userData.lowerStairPreview.visible=!together||state.explode;
 $('bm-explode-field').hidden=!together;$('bm-explode').disabled=state.walk;$('bm-full').disabled=state.walk;
 $('bm-foundation-toggle').textContent=state.showFoundation?'Скрыть фундамент':'Показать фундамент';$('bm-foundation-toggle').setAttribute('aria-pressed',String(state.showFoundation));
 $('bm-basement-toggle').textContent=groups.basement.visible?'Скрыть цокольный этаж':'Показать цокольный этаж';$('bm-basement-toggle').setAttribute('aria-pressed',String(groups.basement.visible));
 $('bm-terrain-toggle').textContent=state.showTerrain?'Скрыть землю · 5 м вокруг':'Показать землю · 5 м вокруг';$('bm-terrain-toggle').setAttribute('aria-pressed',String(state.showTerrain));
 $('bm-grade-note').textContent=state.floor==='both'&&state.explode?'Этажи разнесены для осмотра':'Условные уровни 3D-модели';
 root.querySelectorAll('[data-floor]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.floor===state.floor));b.disabled=state.walk;});
 scene.updateMatrixWorld(true);if(!state.walk)refreshPhysics();
 rebuildRooms();selectRoom(state.selected);fit();
}
function fit(){const w=Math.max(stage.clientWidth,1),h=Math.max(stage.clientHeight,1);renderer.setSize(w,h,false);const aspect=w/h;if(state.freeCamera||state.walk){freeCamera.aspect=aspect;freeCamera.updateProjectionMatrix();render();return;}const base=state.showTerrain?(state.floor==='both'&&state.explode?36:32):state.floor==='both'?(state.explode?28:22):state.floor==='upper'?20:18.5;const v=Math.max(base*.79,base/aspect)/state.zoom;camera.left=-v*aspect/2;camera.right=v*aspect/2;camera.top=v/2;camera.bottom=-v/2;camera.updateProjectionMatrix();render();}
function render(){
 syncWalker();
 if(!state.freeCamera&&!state.walk){
 const floorY=groups[state.floor]?.position.y||0;
 const targetY=state.floor==='both'?(state.explode?6.1:4.0):state.showTerrain?(floorY+siteConfig.gradeY)/2+.45:floorY+.45;
 const target=new T.Vector3(state.panX,targetY,state.panZ),phi=state.top?.001:state.phi;
 const radius=35;camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(state.theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(state.theta));camera.up.set(0,1,0);camera.lookAt(target);camera.updateMatrixWorld();
 const w=stage.clientWidth,h=stage.clientHeight;
 if(state.showTerrain){
  const bounds=siteConfig.outerBounds,top=Math.max(siteConfig.gradeY,...Object.values(groups).filter(g=>g.visible).map(g=>g.position.y+modelConfig.clearHeight+.05));
  let maxX=0,maxY=0;
  for(const x of [bounds.minX-5.44,bounds.maxX-5.44])for(const y of [siteConfig.bottomY,top])for(const z of [bounds.minZ-7.52,bounds.maxZ-7.52]){
   const p=new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));
  }
  const aspect=w/h,v=Math.max(maxY,maxX/aspect)*1.06/state.zoom;camera.left=-v*aspect;camera.right=v*aspect;camera.top=v;camera.bottom=-v;camera.updateProjectionMatrix();
 }
 }else{camera.updateMatrixWorld();}
 renderer.render(scene,camera);const w=stage.clientWidth,h=stage.clientHeight;
 for(const l of labels){if(!l.g.visible){l.el.hidden=true;continue;}const p=l.g.localToWorld(l.pos.clone()).project(camera);const x=(p.x+1)*w/2,y=(1-p.y)*h/2;const behindFloor=state.floor==='both'&&!state.explode&&l.g.userData.level!=='upper';l.el.hidden=state.wallAreas||state.walk||p.z<-1||p.z>1||behindFloor||(state.full&&!state.top&&l.g.userData.level!=='upper')||x<12||x>w-12||y<15||y>h-15;l.el.style.left=x+'px';l.el.style.top=y+'px';const small=Number((l.r.area||'20').replace(',','.'))<6||w<480||state.floor==='both';const a=l.el.querySelector('.text-small');if(a)a.hidden=small;}
 renderWallAreas();
}
root.querySelectorAll('[data-floor]').forEach(b=>b.addEventListener('click',()=>{state.floor=b.dataset.floor;state.selected='';if(!state.freeCamera){state.zoom=1;state.panX=0;state.panZ=0;}if(state.floor==='basement')state.showBasement=true;if(state.floor==='both'){state.explode=false;$('bm-explode').checked=false;}applyState();}));
$('bm-top').addEventListener('change',e=>{state.top=e.target.checked;render();});
$('bm-full').addEventListener('change',e=>{state.full=e.target.checked;build();});
$('bm-explode').addEventListener('change',e=>{state.explode=e.target.checked;applyState();});
$('bm-basement-toggle').addEventListener('click',()=>{state.showBasement=!groups.basement.visible;if(state.showBasement&&state.floor!=='both'&&state.floor!=='basement'){state.floor='both';state.explode=false;$('bm-explode').checked=false;}applyState();});
$('bm-wall-areas').addEventListener('click',()=>{state.wallAreas=!state.wallAreas;applyState();});
$('bm-doors-toggle').addEventListener('click',()=>{state.showDoors=!state.showDoors;applyState();});
$('bm-foundation-toggle').addEventListener('click',()=>{state.showFoundation=!state.showFoundation;applyState();});
$('bm-terrain-toggle').addEventListener('click',()=>{state.showTerrain=!state.showTerrain;applyState();});
const screenButton=$('bm-fullscreen'),screenStatus=$('bm-screen-status');
const inFullscreen=()=>document.fullscreenElement===root||document.webkitFullscreenElement===root;
function syncFullscreen(){
 const active=inFullscreen();screenButton.textContent=active?'Выйти из полного экрана':'На весь экран';screenButton.setAttribute('aria-pressed',String(active));
 screenStatus.hidden=true;fit();
}
screenButton.addEventListener('click',async()=>{
 screenStatus.hidden=true;
 try{
  if(inFullscreen()){
   const exit=document.exitFullscreen||document.webkitExitFullscreen;
   if(!exit)throw new Error('Fullscreen exit unavailable');await exit.call(document);
  }else{
   const enter=root.requestFullscreen||root.webkitRequestFullscreen;
   if(!enter)throw new Error('Fullscreen unavailable');await enter.call(root);
  }
  syncFullscreen();
 }catch(error){
  screenStatus.textContent='Полный экран недоступен в этом просмотре. Откройте файл building-3d.html в браузере и нажмите «На весь экран».';screenStatus.hidden=false;
 }
});
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('webkitfullscreenchange',syncFullscreen);
$('bm-room').addEventListener('change',e=>selectRoom(e.target.value));
$('bm-left').onclick=()=>{if(state.freeCamera||state.walk)lookFree(.3,0);else{state.theta-=.3;render();}};$('bm-right').onclick=()=>{if(state.freeCamera||state.walk)lookFree(-.3,0);else{state.theta+=.3;render();}};
function zoom(delta){if(!Number.isFinite(delta)||delta<=0)return;if(state.freeCamera||state.walk){moveFree(Math.log(delta)*6,0,0);return;}state.zoom=T.MathUtils.clamp(state.zoom*delta,.55,3.3);fit();}
$('bm-plus').onclick=()=>zoom(1.2);$('bm-minus').onclick=()=>zoom(1/1.2);
function setFreeCamera(active){
 if(state.walk)setWalk(false);
 if(active===state.freeCamera)return;
 if(active){
  const direction=orbitCamera.getWorldDirection(new T.Vector3());
  const distance=(orbitCamera.top-orbitCamera.bottom)/2/Math.tan(T.MathUtils.degToRad(freeCamera.fov/2));
  freeCamera.position.copy(orbitCamera.position).addScaledVector(direction,35-distance);
  freeCamera.quaternion.copy(orbitCamera.quaternion);freeAngles.setFromQuaternion(freeCamera.quaternion,'YXZ');
  camera=freeCamera;
 }else{camera=orbitCamera;}
 state.freeCamera=active;
 $('bm-camera').textContent=active?'Привязать камеру к дому':'Открепить камеру';
 $('bm-camera').setAttribute('aria-pressed',String(active));$('bm-free-controls').hidden=!active;$('bm-top').disabled=active;$('bm-up').hidden=false;$('bm-down').hidden=false;
 $('bm-movement-help').textContent='Мышь — осмотр · правая кнопка — сдвиг · колёсико / WASD — движение · Q/E — ниже/выше · Shift — быстрее.';
 fit();
}
function lookFree(yaw,pitch){
 freeAngles.y+=yaw;freeAngles.x=T.MathUtils.clamp(freeAngles.x+pitch,-Math.PI/2+.015,Math.PI/2-.015);
 freeCamera.quaternion.setFromEuler(freeAngles);render();
}
function moveFree(forward,right,up){
 if(state.walk){moveWalker(forward,right);return;}
 if(!state.freeCamera)return;
 const direction=freeCamera.getWorldDirection(new T.Vector3()),side=new T.Vector3(1,0,0).applyQuaternion(freeCamera.quaternion);
 freeCamera.position.addScaledVector(direction,forward).addScaledVector(side,right);freeCamera.position.y+=up;render();
}
function panFree(dx,dy){
 if(state.walk){moveWalker(-dy*.015,-dx*.015);return;}
 const scale=2*Math.tan(T.MathUtils.degToRad(freeCamera.fov/2))*12/Math.max(stage.clientHeight,1);
 const side=new T.Vector3(1,0,0).applyQuaternion(freeCamera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(freeCamera.quaternion);
 freeCamera.position.addScaledVector(side,-dx*scale).addScaledVector(up,dy*scale);render();
}
$('bm-camera').addEventListener('click',()=>setFreeCamera(!state.freeCamera));
for(const [id,vector] of [['bm-forward',[.5,0,0]],['bm-backward',[-.5,0,0]],['bm-strafe-left',[0,-.5,0]],['bm-strafe-right',[0,.5,0]],['bm-up',[0,0,.5]],['bm-down',[0,0,-.5]]]){
 $(id).addEventListener('click',()=>moveFree(...vector));
}
document.addEventListener('keydown',e=>{
 if((!state.freeCamera&&!state.walk)||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,select,textarea,[contenteditable="true"]'))return;
 const moves={KeyW:[1,0,0],ArrowUp:[1,0,0],KeyS:[-1,0,0],ArrowDown:[-1,0,0],KeyA:[0,-1,0],ArrowLeft:[0,-1,0],KeyD:[0,1,0],ArrowRight:[0,1,0],KeyQ:[0,0,-1],KeyE:[0,0,1]};
 const vector=moves[e.code];if(!vector)return;e.preventDefault();if(state.walk){if(!vector[2])startWalkKey(e.code,e.shiftKey);return;}const step=e.shiftKey?1:.25;moveFree(...vector.map(n=>n*step));
});
const pointers=new Map();let down=null,moved=false,pinch=0;
stage.addEventListener('pointerdown',e=>{
 if(e.button>2)return;stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});down={x:e.clientX,y:e.clientY,button:e.button};moved=false;
 if(pointers.size===2){moved=true;const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
});
stage.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 const old=pointers.get(e.pointerId),dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)moved=true;
 if(pointers.size===2){
  moved=true;const p=[...pointers.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
  if(state.freeCamera||state.walk)panFree(dx/2,dy/2);if(pinch>0)zoom(dist/pinch);pinch=dist;return;
 }
 if(state.freeCamera||state.walk){
  if(e.shiftKey||e.buttons===2||e.buttons===4)panFree(dx,dy);else lookFree(-dx*.005,-dy*.005);
 }else{
  if(e.shiftKey||e.buttons===2||e.buttons===4){state.panX-=dx*.02/state.zoom;state.panZ-=dy*.02/state.zoom;}
  else{state.theta-=dx*.007;if(!state.top)state.phi=T.MathUtils.clamp(state.phi+dy*.005,.10,1.35);}render();
 }
});
stage.addEventListener('pointerup',e=>{
 pointers.delete(e.pointerId);
 if(!moved&&down&&down.button===0){
  const bounds=stage.getBoundingClientRect(),p=new T.Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
  const ray=new T.Raycaster();ray.setFromCamera(p,camera);const elements=ray.intersectObjects(elementPicks.filter(m=>m.visible),false);if(elements[0]){selectElement(elements[0].object);return;}const hits=ray.intersectObjects(picks.filter(m=>m.parent.visible));
  if(hits[0]){selectElement(null);selectRoom(hits[0].object.userData.level+':'+hits[0].object.userData.room.id);}
 }
 down=null;
});
stage.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);down=null;});
stage.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.001));},{passive:false});
stage.addEventListener('contextmenu',e=>e.preventDefault());
setMaterials();updateGroundColor(state.groundColor);build();new ResizeObserver(fit).observe(stage);
window.DomSvistka3D={state,groups,wallLabels,facadeConfig,render,applyState,buildVentFacades,syncFacadeControls,updateGroundColor,setFacadeMaterial,setComparison,facadeArea,panelCount,elementInfo,updateSelectedElement,styleSelectedElement,selectRoom,get selectedElement(){return selectedElement;}};
let themeKey=getComputedStyle(root).color;new MutationObserver(()=>{const key=getComputedStyle(root).color;if(key!==themeKey){themeKey=key;Object.values(mats).forEach(m=>{m.map?.dispose();m.dispose();});setMaterials();build();}}).observe(document.documentElement,{attributes:true,subtree:false});
})();
