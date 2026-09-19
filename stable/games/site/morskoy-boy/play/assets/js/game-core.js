"use strict";
(() => {
const SIZE = 10;
const FLEET = [4,3,3,2,2,2,1,1,1,1];
const LETTERS = 'АБВГДЕЖЗИК';
const coord = i => `${LETTERS[i % SIZE]}${Math.floor(i / SIZE) + 1}`;
function around(i, diagonal = true) {
  const result = [], x = i % SIZE, y = Math.floor(i / SIZE);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
    if (x+dx >= 0 && x+dx < SIZE && y+dy >= 0 && y+dy < SIZE) result.push((y+dy)*SIZE+x+dx);
  }
  return result;
}
function cellsFor(start, length, vertical) {
  if (!Number.isInteger(start) || start < 0 || start >= 100 || !Number.isInteger(length) || length < 1 || length > 4) return [];
  const x = start % SIZE, y = Math.floor(start/SIZE);
  if ((!vertical && x+length > SIZE) || (vertical && y+length > SIZE)) return [];
  return Array.from({length}, (_,n) => start+n*(vertical?SIZE:1));
}
function canPlace(fleet, cells) {
  if (!cells.length) return false;
  const occupied = new Set(fleet.flatMap(ship => ship.cells));
  return cells.every(i => !occupied.has(i) && around(i).every(j => !occupied.has(j)));
}
function randomFleet() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const fleet = [];
    for (const length of FLEET) {
      const options=[];
      for (let i=0;i<100;i++) for (const vertical of [false,true]) {
        const cells=cellsFor(i,length,vertical);
        if (canPlace(fleet,cells)) options.push(cells);
      }
      if (!options.length) break;
      fleet.push({cells:options[Math.floor(Math.random()*options.length)]});
    }
    if (fleet.length === FLEET.length) return fleet;
  }
  throw new Error('Не удалось расставить корабли. Попробуйте ещё раз.');
}
const newShots = () => Array(100).fill(null);
const isSunk = (ship, shots) => ship.cells.every(i => shots[i] === 'sunk' || shots[i] === 'hit');
const remaining = (fleet, shots) => fleet.filter(s => !isSunk(s,shots)).length;
function fire(fleet, shots, index) {
  if (!Number.isInteger(index) || index < 0 || index >= 100) throw new Error('Выберите клетку на поле.');
  if (shots[index]) throw new Error('Эта клетка уже проверена.');
  const ship=fleet.find(s=>s.cells.includes(index));
  if (!ship) { shots[index]='miss'; return {type:'miss',won:false}; }
  shots[index]='hit';
  if (isSunk(ship,shots)) {
    ship.cells.forEach(i=>shots[i]='sunk');
    ship.cells.flatMap(i=>around(i)).forEach(i=>{if (!shots[i]) shots[i]='inferred';});
    return {type:'sunk',length:ship.cells.length,won:remaining(fleet,shots)===0};
  }
  return {type:'hit',won:false};
}
// The computer sees only its previous shots, never the player's hidden fleet.
function chooseTarget(shots) {
  const wounded=shots.map((s,i)=>s==='hit'?i:-1).filter(i=>i>=0);
  let candidates=[];
  if (wounded.length>1) {
    const first=wounded[0], connected=new Set([first]), pending=[first];
    while (pending.length) for (const n of around(pending.pop(),false)) if (shots[n]==='hit'&&!connected.has(n)) {connected.add(n);pending.push(n);}
    const group=[...connected].sort((a,b)=>a-b);
    if (group.length>1) {
      const vertical=group[1]-group[0]===SIZE;
      const endpoints=[group[0]-(vertical?SIZE:1),group.at(-1)+(vertical?SIZE:1)];
      candidates=endpoints.filter(i=>i>=0&&i<100&&!shots[i]&&(vertical||Math.floor(i/SIZE)===Math.floor(first/SIZE)));
    }
  }
  if (!candidates.length && wounded.length) candidates=[...new Set(wounded.flatMap(i=>around(i,false)))].filter(i=>!shots[i]);
  if (!candidates.length) {
    const available=shots.map((s,i)=>!s?i:-1).filter(i=>i>=0);
    candidates=available.filter(i=>(i%SIZE+Math.floor(i/SIZE))%2===0);
    if (!candidates.length) candidates=available;
  }
  return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:-1;
}



function createSession(mode, names=['Игрок 1','Игрок 2']) {
  if (!['computer','local'].includes(mode)) throw new Error('Выберите режим игры.');
  const players=mode==='computer'?['Вы','Компьютер']:names.map((name,i)=>String(name).trim().slice(0,24)||`Игрок ${i+1}`);
  if(players[0]===players[1]) {players[0]+=' · 1';players[1]+=' · 2';}
  const matchId=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return {mode,players,matchId,startedAt:null,endedAt:null,currentPlayer:0,phase:mode==='local'?'handoff':'setup',pendingPhase:mode==='local'?'setup':null,ready:[false,false],manual:false,turn:'player',own:randomFleet(),enemy:randomFleet(),ownShots:newShots(),enemyShots:newShots(),shots:0,hits:0,otherShots:0,otherHits:0,log:[],lastOwn:-1,lastEnemy:-1,winner:null,message:'Флот готов к выходу',help:'Оставьте эту расстановку или измените её перед боем.',handoffReason:''};
}

function passDevice(state, nextPlayer, nextPhase, reason='') {
  if(nextPlayer!==state.currentPlayer) {
    [state.own,state.enemy]=[state.enemy,state.own];
    [state.ownShots,state.enemyShots]=[state.enemyShots,state.ownShots];
    [state.shots,state.otherShots]=[state.otherShots,state.shots];
    [state.hits,state.otherHits]=[state.otherHits,state.hits];
    [state.lastOwn,state.lastEnemy]=[state.lastEnemy,state.lastOwn];
  }
  state.currentPlayer=nextPlayer;state.phase='handoff';state.pendingPhase=nextPhase;state.turn='player';state.manual=false;state.handoffReason=reason;
}

function revealPlayer(state) {
  if(state.phase!=='handoff')throw new Error('Сейчас не нужно передавать устройство.');
  state.phase=state.pendingPhase;state.pendingPhase=null;
  if(state.phase==='battle'&&!state.startedAt)state.startedAt=new Date().toISOString();
  state.message=state.phase==='setup'?`${state.players[state.currentPlayer]}, расставьте флот`:`${state.players[state.currentPlayer]}, ваш ход`;
  state.help=state.phase==='setup'?'Второй игрок не должен видеть вашу расстановку.':'Выберите клетку на поле соперника. При попадании стреляйте ещё раз.';
}

function confirmFleet(state) {
  if(state.phase!=='setup')throw new Error('Сейчас нельзя подтвердить расстановку.');
  if(state.own.length!==10)throw new Error('Сначала расставьте все 10 кораблей.');
  state.ready[state.currentPlayer]=true;
  if(state.mode==='local') {
    if(!state.ready[1-state.currentPlayer])passDevice(state,1-state.currentPlayer,'setup','Первый флот готов. Теперь очередь второго игрока.');
    else passDevice(state,0,'battle','Оба флота готовы. Первый ход — у первого игрока.');
  } else {state.phase='battle';state.startedAt=new Date().toISOString();state.turn='player';state.message='Ваш ход, командир';state.help='Выберите клетку на поле противника. Попадание даёт ещё один выстрел.';}
}

function endBattle(state,winner) {
  state.phase='finished';state.winner=winner;state.endedAt=new Date().toISOString();
  if(state.mode==='local') {
    state.message=`${state.players[state.currentPlayer]} побеждает!`;
    state.help=`Все 10 кораблей соперника потоплены. Выстрелов победителя: ${state.shots}.`;
  } else {
    state.message=winner==='player'?'Победа! Море под вашим контролем.':'Ваш флот потоплен';
    state.help=winner==='player'?`Все 10 кораблей противника потоплены. Вы сделали ${state.shots} выстрелов.`:'Противник победил в этой партии. Попробуйте новую расстановку.';
  }
}

function takePlayerShot(state,index) {
  if(state.phase!=='battle'||state.turn!=='player')throw new Error('Сейчас нельзя стрелять.');
  const result=fire(state.enemy,state.enemyShots,index);
  const shooter=state.currentPlayer;
  state.lastEnemy=index;state.shots++;if(result.type!=='miss')state.hits++;
  state.log.push({number:state.log.length+1,shooter,index,type:result.type});
  if(result.won)endBattle(state,'player');
  else if(result.type==='miss') {
    if(state.mode==='local')passDevice(state,1-shooter,'battle',`${state.players[shooter]}: ${coord(index)} — мимо. Ход переходит сопернику.`);
    else {state.turn='ai';state.message=`${coord(index)} — мимо. Ход противника`;state.help='Дождитесь ответного выстрела.';}
  } else {state.message=result.type==='sunk'?`${coord(index)} — корабль потоплен!`:`${coord(index)} — есть попадание!`;state.help='Стреляйте ещё раз. Удачный выстрел сохраняет ваш ход.';}
  return result;
}

function takeComputerShot(state) {
  if(state.mode!=='computer'||state.phase!=='battle'||state.turn!=='ai')throw new Error('Сейчас не ход компьютера.');
  const index=chooseTarget(state.ownShots),result=fire(state.own,state.ownShots,index);
  state.lastOwn=index;state.otherShots++;if(result.type!=='miss')state.otherHits++;
  state.log.push({number:state.log.length+1,shooter:1,index,type:result.type});
  if(result.won)endBattle(state,'ai');
  else if(result.type==='miss') {state.turn='player';state.message=`Противник промахнулся по ${coord(index)}. Ваш ход`;state.help='Выберите следующую цель на поле противника.';}
  else {state.message=result.type==='sunk'?`Противник потопил ваш корабль на ${coord(index)}`:`Противник попал в ${coord(index)}`;state.help='После попадания противник стреляет ещё раз.';}
  return result;
}

function visibleSession(state) {
  if(!state||state.phase==='menu')return {phase:'menu',modes:['computer','local']};
  if(state.phase==='handoff')return {phase:'handoff',mode:state.mode,nextPlayer:state.players[state.currentPlayer],nextPhase:state.pendingPhase};
  return {mode:state.mode,phase:state.phase,turn:state.turn,currentPlayer:state.players[state.currentPlayer],winner:state.phase==='finished'?(state.winner==='ai'?state.players[1]:state.players[state.currentPlayer]):null,message:state.message,ownShipsRemaining:remaining(state.own,state.ownShots),enemyShipsRemaining:remaining(state.enemy,state.enemyShots),ownFleet:state.own.map(s=>s.cells.map(coord)),shotsFired:state.shots,hits:state.hits,enemyField:state.enemyShots.flatMap((result,index)=>result?[{coordinate:coord(index),result}]:[])};
}



window.BattleshipCore = Object.freeze({
  SIZE,FLEET,LETTERS,coord,around,cellsFor,canPlace,randomFleet,newShots,isSunk,remaining,fire,chooseTarget,
  createSession,passDevice,revealPlayer,confirmFleet,endBattle,takePlayerShot,takeComputerShot,visibleSession
});
})();
