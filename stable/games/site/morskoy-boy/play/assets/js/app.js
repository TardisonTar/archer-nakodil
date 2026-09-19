"use strict";
const {SIZE,FLEET,LETTERS,coord,around,cellsFor,canPlace,randomFleet,newShots,isSunk,remaining,fire,chooseTarget,
  createSession,passDevice,revealPlayer,confirmFleet,endBattle,takePlayerShot,takeComputerShot,visibleSession}=window.BattleshipCore;
const {summarizeMatch,createMatchHistory}=window.BattleshipHistory;
const {createLanClient}=window.BattleshipLan;
const {shotDuration,shotOrigin,ShotTrails,OceanBoard}=window.BattleshipRenderer;
const RELEASE=Object.freeze({app:'morskoy-boy-sonar',schema:2,build:2026091511,version:'0.1.5.0'});
function startUpdateStatus(canReload) {
  const status=$('update-status'),button=$('update-check'),skip=$('update-skip');
  $('game-version').textContent=`Версия ${RELEASE.version}`;
  if(skip)skip.hidden=true;
  let busy=false;
  async function check() {
    if(busy||!canReload())return;
    busy=true;button.disabled=true;
    try {
      if(location.protocol==='file:') {status.textContent='Автономная сборка · обновление заменой архива';return;}
      if(document.querySelector('meta[name="battleship-lan-server"]')) {
        const response=await fetch('/api/update-info',{cache:'no-store'});
        if(!response.ok)throw new Error('unavailable');
        const info=await response.json();status.textContent=info.message||'LAN-сервер запущен';return;
      }
      status.textContent='Проверяем версию…';
      const response=await fetch('updates.json?check='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('unavailable');
      const manifest=await response.json();
      if(manifest?.build>RELEASE.build)status.textContent=`Доступна версия ${manifest.version||manifest.build} · замените файлы проекта`;
      else status.textContent='Установлена последняя версия';
    } catch {status.textContent='Источник обновлений недоступен · можно играть';}
    finally {busy=false;button.disabled=false;}
  }
  button.addEventListener('click',check);
  void check();
}

const $ = id => document.getElementById(id);
let state={phase:'menu'}, aiTimer, soundEnabled=false, audioContext, restartAction='restart';
let selectedLength=4, vertical=false, hoverIndex=null;
const ownCells=[], enemyCells=[];
const typeNames={miss:'Мимо',hit:'Ранен',sunk:'Потоплен'};
const matchHistory=createMatchHistory();
let historyVisibleLimit=20;
let ownOcean, enemyOcean, shotTrails, effectTimer, shotBusy=false;

function clearAnimations() {
  clearTimeout(effectTimer);shotTrails?.clear();shotBusy=false;ownOcean?.clear();enemyOcean?.clear();
  lanSnapshotQueue.length=0;
}

let lanOnline=true,lanMessage='',lanSnapshot=null,lanPending=false,lanConnecting=false,lanAddresses=[];
const lanSnapshotQueue=[];
const lanRecorded=new Map();
const lanClient=createLanClient(applyLanSnapshot,updateLanConnection);

function updateLanConnection(online,message) {
  const changed=lanOnline!==online;
  if(message)lanMessage=message;else if(changed&&online)lanMessage='';
  lanOnline=online;
  if(state.mode==='lan'&&(changed||message))render();
  if(state.mode!=='lan'&&message){$('lan-connect-error').hidden=false;$('lan-connect-error').textContent=message;}
}

function applyLanSnapshot(snapshot) {
  if(shotBusy&&state.mode==='lan'&&state.matchId===snapshot.matchId){
    const last=lanSnapshotQueue.at(-1)||lanSnapshot;
    if(last.version!==snapshot.version||JSON.stringify(last.connected)!==JSON.stringify(snapshot.connected))lanSnapshotQueue.push(snapshot);
    return;
  }
  if(lanSnapshot?.matchId===snapshot.matchId&&lanSnapshot.version===snapshot.version&&state.mode==='lan'&&JSON.stringify(lanSnapshot.connected)===JSON.stringify(snapshot.connected))return;
  const previous=state,sameMatch=state.mode==='lan'&&state.matchId===snapshot.matchId;
  lanSnapshot=snapshot;lanMessage='';
  const spectator=!!snapshot.spectator,me=spectator?0:snapshot.playerIndex,other=1-me,phase=spectator?(snapshot.phase==='setup'?'waiting':snapshot.phase==='closed'?'waiting':snapshot.phase):(snapshot.phase==='setup'?(snapshot.ready[me]?'waiting':'setup'):snapshot.phase==='closed'?'waiting':snapshot.phase);
  const myLog=snapshot.log.filter(shot=>shot.shooter===me),otherLog=snapshot.log.filter(shot=>shot.shooter!==me);
  const myTurn=!spectator&&snapshot.turnIndex===me&&snapshot.connected[other];
  state={mode:'lan',spectator,players:snapshot.players,currentPlayer:me,matchId:snapshot.matchId,phase,turn:spectator?'spectator':myTurn?'player':'opponent',
    manual:!spectator&&phase==='setup'&&sameMatch?previous.manual:false,
    own:snapshot.ownFleet||(sameMatch?previous.own:randomFleet()),enemy:snapshot.enemyFleet,
    ownShots:snapshot.ownShots,enemyShots:snapshot.enemyShots,enemyRemaining:snapshot.enemyRemaining,
    shots:myLog.length,hits:myLog.filter(shot=>shot.type!=='miss').length,otherShots:otherLog.length,otherHits:otherLog.filter(shot=>shot.type!=='miss').length,
    log:snapshot.log,lastOwn:snapshot.lastOwn,lastEnemy:snapshot.lastEnemy,startedAt:snapshot.startedAt,endedAt:snapshot.endedAt,
    winner:snapshot.winnerIndex===null?null:snapshot.winnerIndex===me?'player':'opponent',lanResult:snapshot.result,
    message:'',help:''};
  if(!sameMatch){clearAnimations();selectedLength=4;vertical=false;hoverIndex=null;}
  if(snapshot.phase==='closed') {state.message='Комната закрыта';state.help=spectator?'Наблюдение завершено.':'Соперник вышел из комнаты. Вернитесь в меню и создайте новую.';}
  else if(spectator&&snapshot.phase==='setup') {state.message='Наблюдение за подготовкой';state.help='Игроки расставляют флот. Наблюдатель не может вмешиваться в матч.';}
  else if(spectator&&phase==='finished') {const w=snapshot.winnerIndex;state.message=w===0||w===1?`Победил ${state.players[w]}`:'Матч завершён';state.help='Вы смотрели матч в режиме наблюдателя.';}
  else if(spectator) {state.message=`Ход игрока «${state.players[snapshot.turnIndex]}»`;state.help='Режим наблюдателя: оба флота видимы, управление боем отключено.';}
  else if(phase==='setup') {state.message=`${state.players[me]}, расставьте флот`;state.help=snapshot.joined?'Подтвердите расстановку, когда будете готовы.':'Передайте другу адрес сервера и код комнаты.';}
  else if(phase==='waiting') {state.message='Ваш флот готов';state.help=snapshot.joined?'Ожидаем готовности соперника. Бой начнётся автоматически.':'Ждём, когда друг подключится к комнате.';}
  else if(phase==='finished') {state.message=state.winner==='player'?'Победа! Флот соперника потоплен.':`Победил ${state.players[other]}`;state.help=snapshot.closed?'Соперник вышел из комнаты. Для новой игры вернитесь в меню.':'Для новой партии оба игрока должны согласиться на реванш.';saveFinishedMatch();}
  else if(!snapshot.connected[other]) {state.message='Ожидаем подключения соперника';state.help='Партия сохранена на сервере. Друг может вернуться, обновив страницу в той же вкладке.';}
  else {state.message=myTurn?'Ваш ход':`Ход игрока «${state.players[other]}»`;state.help=myTurn?'Выберите клетку на поле соперника. Попадание даёт ещё один ход.':'Ожидайте выстрела соперника.';}
  const latest=snapshot.log.at(-1),before=previous.mode==='lan'&&sameMatch?previous.log.length:0;
  const newShot=latest&&snapshot.log.length>before&&sameMatch;
  if($('lan-dialog').open)$('lan-dialog').close();
  if(newShot){
    const own=latest.shooter!==me,fleet=own?state.own:state.enemy;
    const cells=fleet.find(ship=>ship.cells.includes(latest.index))?.cells||[];
    const origin=own?shotOrigin([],[],true):shotOrigin(previous.own,previous.ownShots);
    beginFlight(own);
    shotTrails.launch(own?enemyOcean:ownOcean,own?ownOcean:enemyOcean,origin,latest.index,own,()=>{
      beep(latest.type);render();
      (own?ownOcean:enemyOcean)?.impact(latest.index,latest.type,cells);
      finishShot(latest.type);
    });
  }else render();
}

async function sendLanAction(action,data={}) {
  if(lanPending)return false;
  lanPending=true;lanMessage='';render();
  try{await lanClient.action(action,data);return true;}
  catch(error){lanMessage=error.status?error.message:'Нет связи с сервером. Проверяем, дошло ли действие…';return false;}
  finally{lanPending=false;render();}
}

function openLanDialog() {
  if(location.hostname==='archer.invalid'){location.href='archer://lan';return;}
  $('lan-instructions').hidden=lanClient.enabled;$('lan-controls').hidden=!lanClient.enabled;
  $('lan-connect-error').hidden=true;$('lan-dialog').showModal();
}

async function connectLan(action) {
  if(lanConnecting)return;
  const name=$('lan-name').value.trim()||'Игрок',code=$('lan-code').value.trim().toUpperCase();
  if((action==='join'||action==='spectate')&&!/^[A-Z2-9]{6}$/.test(code)){$('lan-connect-error').hidden=false;$('lan-connect-error').textContent='Введите код комнаты из 6 букв и цифр.';return;}
  lanConnecting=true;$('lan-create').disabled=true;$('lan-join').disabled=true;$('lan-spectate').disabled=true;$('lan-connect-error').hidden=true;
  try{await lanClient.connect(action,name,code);}
  catch(error){$('lan-connect-error').hidden=false;$('lan-connect-error').textContent=error.status?error.message:'Сервер недоступен. Проверьте, что окно сервера открыто.';}
  finally{lanConnecting=false;$('lan-create').disabled=false;$('lan-join').disabled=false;$('lan-spectate').disabled=false;}
}

function historyElement(tag,className,text) {
  const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;
}

function refreshHistoryCount() {
  $('history-menu-count').textContent=matchHistory.list().length;
}

function renderHistory() {
  const records=matchHistory.list();
  $('history-menu-count').textContent=records.length;
  $('history-summary').textContent=records.length?`Завершённых матчей: ${records.length}`:'';
  $('history-empty').hidden=records.length>0;
  $('history-storage-error').hidden=!matchHistory.issue;
  $('history-storage-error').textContent=matchHistory.issue==='read'?'Браузер не предоставил доступ к сохранённой истории. Новые результаты доступны только до закрытия вкладки.':matchHistory.issue==='write'?'Браузер не сохранил последние результаты. Они доступны только до закрытия вкладки.':'';
  const list=$('history-list');list.replaceChildren();
  records.slice(0,historyVisibleLimit).forEach(record=>{
    const card=historyElement('li','history-card');
    const header=historyElement('div','history-card-header');
    const date=historyElement('time','',new Date(record.endedAt).toLocaleString('ru-RU',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}));date.dateTime=record.endedAt;
    header.append(date,historyElement('span','history-mode',record.mode==='lan'?'Локальная сеть':record.mode==='local'?'С другом':'Против компьютера'));
    const outcome=record.mode==='computer'?(record.winnerIndex===0?'Победа':'Поражение'):`Победитель: ${record.players[record.winnerIndex].name}`;
    const title=historyElement('h3','history-outcome'+(record.mode==='computer'&&record.winnerIndex===1?' history-loss':''),outcome);
    const wrapper=historyElement('div','history-table-wrapper'),table=document.createElement('table');
    const caption=historyElement('caption','sr-only',`Статистика матча: ${record.players.map(player=>player.name).join(' против ')}`);table.append(caption);
    const thead=document.createElement('thead'),labels=document.createElement('tr');
    for(const label of ['Игрок','Выстрелы','Попадания','Точность']){const th=historyElement('th','',label);th.scope='col';labels.append(th);}thead.append(labels);table.append(thead);
    const tbody=document.createElement('tbody');
    record.players.forEach((player,index)=>{
      const row=document.createElement('tr'),name=historyElement('th','',player.name);name.scope='row';
      if(index===record.winnerIndex)name.append(historyElement('span','history-winner-label','Победитель'));
      row.append(name,historyElement('td','',player.shots),historyElement('td','',player.hits),historyElement('td','',player.shots?`${Math.round(player.hits/player.shots*100)}%`:'—'));tbody.append(row);
    });
    table.append(tbody);wrapper.append(table);card.append(header,title,wrapper);list.append(card);
  });
  $('history-more').hidden=records.length<=historyVisibleLimit;
}

function openHistory() {historyVisibleLimit=20;renderHistory();$('history-dialog').showModal();}
function saveFinishedMatch() {
  if(state.phase!=='finished'||state.spectator||state.historyPersistence!==undefined)return;
  if(state.mode==='lan'){
    if(!lanRecorded.has(state.matchId))lanRecorded.set(state.matchId,matchHistory.save(state.lanResult).saved);
    state.historyPersistence=lanRecorded.get(state.matchId);
  }else state.historyPersistence=matchHistory.save(summarizeMatch(state)).saved;
}

function makeBoard(id, list, own) {
  const board=$(id);
  const corner=document.createElement('span');board.append(corner);
  for (const letter of LETTERS) {const el=document.createElement('span');el.className='coordinate';el.textContent=letter;el.setAttribute('aria-hidden','true');board.append(el);}
  for (let y=0;y<10;y++) {
    const label=document.createElement('span');label.className='coordinate';label.textContent=y+1;label.setAttribute('aria-hidden','true');board.append(label);
    for (let x=0;x<10;x++) {
      const index=y*10+x, button=document.createElement('button');
      button.className='cell';button.type='button';button.dataset.index=index;button.tabIndex=index===0?0:-1;
      button.addEventListener('click',()=>own?placeAt(index):playerFire(index));
      const aim=()=>{if(!button.disabled)(own?ownOcean:enemyOcean)?.setHover(index);};
      button.addEventListener('pointerenter',aim);button.addEventListener('focus',aim);
      button.addEventListener('pointerenter',()=>{if (own&&state.phase==='setup'&&state.manual) {hoverIndex=index;renderGhost();}});
      button.addEventListener('focus',()=>{list.forEach(c=>c.tabIndex=-1);button.tabIndex=0;if (own&&state.manual) {hoverIndex=index;renderGhost();}});
      button.addEventListener('keydown',e=>{
        const deltas={ArrowLeft:-1,ArrowRight:1,ArrowUp:-10,ArrowDown:10};
        if (!(e.key in deltas)) return;
        e.preventDefault();
        const d=deltas[e.key];let n=index;
        for (let k=0;k<100;k++) {n+=d;if (n<0||n>=100||(Math.abs(d)===1&&Math.floor(n/10)!==y)) break;if (!list[n].disabled) {list[n].focus();break;}}
      });
      list.push(button);board.append(button);
    }
  }
  board.addEventListener('pointerleave',()=>{hoverIndex=null;renderGhost();});
}

function beep(type) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if (audioContext.state==='suspended') void audioContext.resume();
    const now=audioContext.currentTime;
    const notes=type==='win'?[440,554,659,880]:type==='sunk'?[170,125,80]:type==='hit'?[210,110]:[460];
    notes.forEach((hz,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type==='miss'?'sine':'triangle';osc.frequency.setValueAtTime(hz,now+i*.09);gain.gain.setValueAtTime(0,now+i*.09);gain.gain.linearRampToValueAtTime(.07,now+i*.09+.012);gain.gain.exponentialRampToValueAtTime(.001,now+i*.09+.16);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now+i*.09);osc.stop(now+i*.09+.17);});
  } catch {soundEnabled=false;$('sound').textContent='Звук недоступен';$('sound').setAttribute('aria-pressed','false');}
}

function reset(mode=state.mode||'computer', names=state.players) {
  if(mode==='lan'){void sendLanAction('rematch');return;}
  clearTimeout(aiTimer);
  clearAnimations();
  state=createSession(mode,names);
  selectedLength=4;vertical=false;hoverIndex=null;
  render();
  focusCurrentScreen();
}

function showMenu() {
  clearAnimations();
  if(state.mode==='lan'){void lanClient.leave();lanSnapshot=null;lanMessage='';lanPending=false;lanOnline=true;}
  clearTimeout(aiTimer);state={phase:'menu'};hoverIndex=null;render();$('choose-computer').focus();
}

function focusCurrentScreen() {
  if(state.phase==='handoff')$('reveal-player').focus();
  else if(state.phase==='setup')$('start').focus();
  else if(state.phase==='battle'&&state.turn==='player')enemyCells.find(c=>!c.disabled)?.focus();
}

function clearHiddenBoards() {
  shotTrails?.clear();ownOcean?.clear();enemyOcean?.clear();
  for(const cell of [...ownCells,...enemyCells]) {cell.className='cell';cell.disabled=true;cell.tabIndex=-1;cell.setAttribute('aria-label','Поле скрыто');}
  $('fleet-picker').replaceChildren();$('battle-log').replaceChildren();
}

function remainingOfLength(length) {return FLEET.filter(l=>l===length).length-state.own.filter(s=>s.cells.length===length).length;}

function renderFleet() {
  const picker=$('fleet-picker');picker.replaceChildren();
  const names={4:'Четырёхпалубный',3:'Трёхпалубные',2:'Двухпалубные',1:'Однопалубные'};
  for (const length of [4,3,2,1]) {
    const total=FLEET.filter(l=>l===length).length, count=state.manual?remainingOfLength(length):total;
    const button=document.createElement('button');button.type='button';button.className='fleet-item'+(state.manual&&selectedLength===length&&count>0?' selected':'');
    button.disabled=!state.manual||count===0;button.setAttribute('aria-pressed',String(state.manual&&selectedLength===length&&count>0));
    button.setAttribute('aria-label',`${length} ${length===1?'палуба':'палубы'}, ${state.manual?'осталось поставить':'кораблей'}: ${count}`);
    const left=document.createElement('span'),blocks=document.createElement('span');blocks.className='ship-blocks';blocks.setAttribute('aria-hidden','true');
    for(let n=0;n<length;n++) blocks.append(document.createElement('i'));
    const label=document.createElement('span');label.className='fleet-item-label';label.textContent=names[length];left.append(blocks,label);
    const right=document.createElement('span');right.className='fleet-item-count';right.textContent=`× ${count}`;button.append(left,right);
    button.addEventListener('click',()=>{selectedLength=length;renderFleet();updatePlacementHelp();renderGhost();const active=picker.querySelector('.selected');active?.focus();});picker.append(button);
  }
}

function renderBoard(list, fleet, shots, own) {
  const showShips=own||state.phase==='finished'||state.spectator;
  const shipMap=new Map();fleet.forEach(ship=>ship.cells.forEach(i=>shipMap.set(i,ship)));
  list.forEach((cell,index)=>{
    const shot=shots[index],ship=showShips?shipMap.get(index):undefined;
    const classes=['cell'];
    if(ship) {classes.push('ship');if (ship.cells.includes(index+1)&&index%10!==9) classes.push('join-right');if (ship.cells.includes(index+10)) classes.push('join-bottom');}
    if(shot) classes.push(shot);
    if(!own&&state.phase==='finished'&&ship&&!shot) classes.push('revealed');
    if(index===(own?state.lastOwn:state.lastEnemy)) classes.push('last-shot');
    cell.className=classes.join(' ');
    const connected=state.mode!=='lan'||(lanOnline&&!lanPending);
    const actionable=!state.spectator&&connected&&(own?(state.phase==='setup'&&state.manual):(state.phase==='battle'&&state.turn==='player'&&!shot&&!shotBusy));
    cell.disabled=!actionable;
    cell.setAttribute('aria-label',`${coord(index)}: ${shot==='hit'?'попадание':shot==='sunk'?'потопленный корабль':shot==='miss'?'промах':shot==='inferred'?'рядом с потопленным, пусто':ship?'ваш корабль':own?'пусто':'неизвестно'}`);
    if (!own && !shot && ship && state.phase==='finished') cell.setAttribute('aria-label',`${coord(index)}: корабль противника`);
  });
  if(!list.some(c=>!c.disabled&&c.tabIndex===0)) {list.forEach(c=>c.tabIndex=-1);const first=list.find(c=>!c.disabled);if(first)first.tabIndex=0;}
}

function renderGhost() {
  ownCells.forEach(c=>c.classList.remove('ghost-valid','ghost-invalid'));
  if (state.phase!=='setup'||!state.manual||hoverIndex===null||remainingOfLength(selectedLength)<=0) return;
  if(state.own.some(s=>s.cells.includes(hoverIndex)))return;
  const cells=cellsFor(hoverIndex,selectedLength,vertical),valid=canPlace(state.own,cells);
  if(!cells.length) {ownCells[hoverIndex].classList.add('ghost-invalid');return;}
  cells.forEach(i=>ownCells[i].classList.add(valid?'ghost-valid':'ghost-invalid'));
}

function updatePlacementHelp() {
  $('placement-help').textContent=!state.manual?'Корабли не касаются друг друга, даже по диагонали.':state.own.length===10?'Флот собран. Подтвердите расстановку или уберите корабль нажатием.':`Выберите клетку для корабля на ${selectedLength} ${selectedLength===1?'палубу':'палубы'}. ${vertical?'Вертикально':'Горизонтально'}.`;
  $('rotate').innerHTML=`${vertical?'↕':'↔'} Повернуть <kbd>R</kbd>`;
  $('rotate').setAttribute('aria-label',`Повернуть корабль. Сейчас ${vertical?'вертикально':'горизонтально'}`);
}

function renderLog() {
  $('log-counter').textContent=String(state.log.length).padStart(2,'0');
  const list=$('battle-log');list.replaceChildren();
  if(!state.log.length) {const li=document.createElement('li');li.className='log-empty';li.textContent='Выберите клетку на поле противника.';list.append(li);return;}
  state.log.slice(-4).reverse().forEach(item=>{
    const li=document.createElement('li'),number=document.createElement('span'),text=document.createElement('span'),result=document.createElement('span');
    number.className='log-index';number.textContent=String(item.number).padStart(2,'0');text.textContent=`${state.players[item.shooter]} → ${coord(item.index)}`;result.className='log-result'+(item.type==='miss'?'':' log-hit');result.textContent=typeNames[item.type];li.append(number,text,result);list.append(li);
  });
}

function render() {
  if(shotTrails?.flight)return;
  const menu=state.phase==='menu',handoff=state.phase==='handoff';
  $('main-menu').hidden=!menu;$('handoff-screen').hidden=!handoff;$('game-screen').hidden=menu||handoff;
  $('menu-button').hidden=menu;$('new-game').hidden=menu||state.mode==='lan';
  if(menu)refreshHistoryCount();
  if(menu||handoff) {
    clearHiddenBoards();
    if(handoff) {
      $('handoff-stage').textContent=state.pendingPhase==='setup'?'ТАЙНАЯ РАССТАНОВКА':'ПЕРЕДАЧА ХОДА';
      $('handoff-number').textContent=String(state.currentPlayer+1).padStart(2,'0');
      $('handoff-title').textContent=`${state.players[state.currentPlayer]}, ваша очередь`;
      $('handoff-reason').textContent=state.handoffReason;$('handoff-reason').hidden=!state.handoffReason;
      $('handoff-help').textContent=`Передайте устройство игроку «${state.players[state.currentPlayer]}». Второй игрок должен отвернуться.`;
      $('reveal-player').innerHTML=state.pendingPhase==='setup'?'Я готов — расставить флот <span aria-hidden="true">→</span>':'Я готов — открыть поле <span aria-hidden="true">→</span>';
    }
    return;
  }
  const setup=state.phase==='setup',battle=state.phase==='battle',ended=state.phase==='finished',network=state.mode==='lan',waiting=state.phase==='waiting';
  $('lan-room-panel').hidden=!network;$('lan-game-error').hidden=!network||!lanMessage;
  if(network){
    $('lan-room-code').textContent=lanSnapshot.code;
    const loopback=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    $('lan-room-address').value=loopback?(lanAddresses[0]||'Узнайте IPv4-адрес компьютера в сети'):location.origin;
    $('lan-peer-status').textContent=state.spectator?'Режим наблюдателя':!lanSnapshot.joined?'Ожидаем друга':lanSnapshot.connected[1-state.currentPlayer]?'Соперник подключён':'Соперник восстанавливает связь';
    $('lan-game-error').textContent=lanMessage;
  }
  $('match-history-result').hidden=!ended;
  if(ended)$('match-save-status').textContent=state.historyPersistence?'Матч сохранён в истории.':'Не удалось сохранить матч в браузере. Результат доступен в истории до закрытия вкладки.';
  const local=state.mode==='local'||network,name=state.players[state.currentPlayer],opponent=state.players[1-state.currentPlayer];
  $('match-label').textContent=state.spectator?`НАБЛЮДАТЕЛЬ · ${state.players[0]} / ${state.players[1]}`:network?`ЛОКАЛЬНАЯ СЕТЬ · ${name} / ${opponent}`:local?`С ДРУГОМ · ${name} / ${opponent}`:'ВЫ ПРОТИВ КОМПЬЮТЕРА';
  $('own-heading').textContent=state.spectator?state.players[0]:local?name:'Ваш флот';$('enemy-heading').textContent=state.spectator?state.players[1]:local?opponent:'Противник';
  $('own-board').setAttribute('aria-label',local?`Поле игрока ${name}, 10 на 10`:'Ваше поле 10 на 10');
  $('enemy-board').setAttribute('aria-label',local?`Поле соперника ${opponent}, 10 на 10`:'Поле противника 10 на 10');
  $('stats-heading').textContent=local?`Стрельба: ${name}`:'Ваша стрельба';
  $('status').textContent=state.message;$('status-help').textContent=state.help;
  $('status-icon').textContent=ended?(state.winner==='player'?'✓':'×'):state.turn==='ai'?'◷':'⌖';
  document.querySelector('.status-strip').className='status-strip'+(ended?(state.winner==='player'?' victory':' defeat'):state.turn==='ai'?' enemy-turn':'');
  $('start').hidden=state.spectator||battle||waiting||(network&&lanSnapshot.closed);$('start').disabled=(setup&&state.own.length!==10)||(network&&(!lanOnline||lanPending||(ended&&lanSnapshot.rematch[state.currentPlayer])));
  $('start').innerHTML=ended?'Сыграть ещё <span aria-hidden="true">↻</span>':local?'Флот готов <span aria-hidden="true">→</span>':'Начать бой <span aria-hidden="true">→</span>';
  if(network&&ended)$('start').textContent=lanSnapshot.rematch[state.currentPlayer]?'Ждём согласия соперника':'Реванш';
  $('phase-number').textContent=setup?'01':battle?'02':'03';$('phase-name').textContent=setup?'Расстановка':battle?'Сражение':'Итог';$('phase-detail').textContent=setup?(local?`Игрок ${state.currentPlayer+1} из 2`:'Подготовьте свой флот'):battle?'Потопите 10 кораблей':'Партия завершена';
  if(waiting){$('phase-number').textContent='01';$('phase-name').textContent='Ожидание';$('phase-detail').textContent='Локальная сеть';}
  $('own-count').textContent=remaining(state.own,state.ownShots);$('enemy-count').textContent=network?state.enemyRemaining:remaining(state.enemy,state.enemyShots);
  $('setup-panel').hidden=!setup;$('battle-info').hidden=setup||waiting;$('board-cover').hidden=!(setup||waiting);
  $('enemy-hint').textContent=state.spectator?'Наблюдение за матчем':setup?'Корабли противника скрыты':ended?'Корабли противника раскрыты':state.turn==='player'?'Выберите клетку для выстрела':'Противник выбирает цель…';
  $('turn-pill').textContent=state.spectator?'НАБЛЮДЕНИЕ':setup?'ОЖИДАНИЕ':ended?'БОЙ ЗАВЕРШЁН':state.turn==='player'?'ВАШ ХОД':'ХОД ПРОТИВНИКА';$('turn-pill').className='turn-pill'+(battle&&state.turn==='player'?' active':'');
  document.querySelector('.enemy-panel').classList.toggle('in-battle',!setup);document.querySelector('.battlefields').classList.toggle('in-battle',!setup);
  $('manual').classList.toggle('active',state.manual);$('manual').setAttribute('aria-pressed',String(state.manual));$('manual').disabled=state.manual;
  $('rotate').hidden=!state.manual;
  $('shuffle').disabled=network&&(!lanOnline||lanPending);$('manual').disabled=state.manual||(network&&(!lanOnline||lanPending));$('rotate').disabled=network&&(!lanOnline||lanPending);
  $('shots-stat').textContent=state.shots;$('hits-stat').textContent=state.hits;$('accuracy-stat').textContent=state.shots?`${Math.round(state.hits/state.shots*100)}%`:'—';
  renderBoard(ownCells,state.own,state.ownShots,true);renderBoard(enemyCells,state.enemy,state.enemyShots,false);
  ownOcean?.setData(state.own,state.ownShots,true,state.lastOwn);
  enemyOcean?.setData(state.enemy,state.enemyShots,ended||state.spectator,state.lastEnemy);
  if(setup){renderFleet();updatePlacementHelp();renderGhost();}renderLog();
}

function placeAt(index) {
  if(state.phase!=='setup'||!state.manual)return;
  const existing=state.own.find(s=>s.cells.includes(index));
  if(existing){state.own=state.own.filter(s=>s!==existing);selectedLength=existing.cells.length;state.message='Корабль возвращён в резерв';state.help='Выберите новое место на своём поле.';render();return;}
  if(remainingOfLength(selectedLength)<=0)return;
  const cells=cellsFor(index,selectedLength,vertical);
  if(!canPlace(state.own,cells)){state.message='Здесь корабль не поместится';state.help='Оставьте одну пустую клетку между кораблями и не выходите за край поля.';render();return;}
  state.own.push({cells});beep('miss');
  if(remainingOfLength(selectedLength)===0)selectedLength=[4,3,2,1].find(l=>remainingOfLength(l)>0)||1;
  state.message=state.own.length===10?'Флот готов к выходу':`Расставлено кораблей: ${state.own.length} из 10`;
  state.help=state.own.length===10?'Все корабли на местах. Можно начинать бой.':'Нажмите на поставленный корабль, чтобы убрать его.';render();
}

function startBattle() {
  if(state.mode==='lan')return sendLanAction('ready',{fleet:state.own});
  confirmFleet(state);hoverIndex=null;selectedLength=4;vertical=false;render();beep('miss');focusCurrentScreen();
  if(state.phase==='battle'&&window.matchMedia('(max-width: 740px)').matches)document.querySelector('.status-strip').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}

function playerFire(index) {
  if(state.phase!=='battle'||state.turn!=='player'||shotBusy)return false;
  if(!Number.isInteger(index)||index<0||index>99||state.enemyShots[index])return false;
  if(state.mode==='lan')return lanOnline?sendLanAction('fire',{index}):false;
  const targetFleet=state.enemy,targetShots=state.enemyShots;
  const shipCells=targetFleet.find(s=>s.cells.includes(index))?.cells||[];
  const origin=shotOrigin(state.own,state.ownShots);
  beginFlight(false);
  shotTrails.launch(ownOcean,enemyOcean,origin,index,false,()=>{
    const result=takePlayerShot(state,index);
    if(result.won)saveFinishedMatch();beep(result.won?'win':result.type);
    if(state.phase==='handoff') {
      // Keep only the outgoing view through the splash, then hide all geometry.
      enemyOcean?.setData(targetFleet,targetShots,false,index);
      $('status').textContent='Мимо — ход переходит сопернику';
      $('status-help').textContent='Дождитесь экрана передачи устройства.';
    } else render();
    enemyOcean?.impact(index,result.type,shipCells);
    finishShot(result.type);
  });
  return true;
}

function aiTurn() {
  if(state.mode!=='computer'||state.phase!=='battle'||state.turn!=='ai'||shotBusy)return;
  // Do not give the launch selector any opponent fleet information.
  const origin=shotOrigin([],[],true);
  const result=takeComputerShot(state);
  const index=state.lastOwn,shipCells=state.own.find(s=>s.cells.includes(index))?.cells||[];
  beginFlight(true);
  shotTrails.launch(enemyOcean,ownOcean,origin,index,true,()=>{
    if(result.won)saveFinishedMatch();beep(result.type);render();
    ownOcean?.impact(index,result.type,shipCells);
    finishShot(result.type);
  });
}

function beginFlight(incoming) {
  shotBusy=true;
  enemyCells.forEach(c=>{c.disabled=true;c.tabIndex=-1;});
  ownOcean?.setHover(-1);enemyOcean?.setHover(-1);
  $('status').textContent=incoming?'Противник открыл огонь':'Выстрел!';
  $('status-help').textContent='Снаряд летит к цели…';
  $('enemy-hint').textContent='Дождитесь попадания снаряда';
  $('turn-pill').textContent='ВЫСТРЕЛ';$('turn-pill').className='turn-pill';
}

function finishShot(type) {
  effectTimer=setTimeout(()=>{
    shotBusy=false;render();
    while(!shotBusy&&lanSnapshotQueue.length)applyLanSnapshot(lanSnapshotQueue.shift());
    if(state.phase==='handoff')focusCurrentScreen();
    if(state.phase==='battle'&&state.turn==='ai')aiTimer=setTimeout(aiTurn,300);
  },shotDuration(type,window.matchMedia('(prefers-reduced-motion: reduce)').matches));
}

function toggleRotation(){if(state.phase!=='setup'||!state.manual)return;vertical=!vertical;updatePlacementHelp();renderGhost();}
function requestRestart(action='restart') {
  if(state.phase==='menu')return;
  if(state.phase==='finished'){if(action==='menu')showMenu();else reset();return;}
  restartAction=action;
  $('restart-title').textContent=action==='menu'?'Вернуться в меню?':'Начать заново?';
  $('restart-help').textContent=action==='menu'?'Текущая партия завершится. В меню можно выбрать другого соперника.':'Текущая партия завершится. Вы сможете заново расставить корабли.';
  if(state.mode==='lan')$('restart-help').textContent='Вы покинете комнату. Текущая сетевая партия завершится и для соперника.';
  $('confirm-restart').textContent=action==='menu'?'В главное меню':'Новая игра';
  $('restart-dialog').showModal();
}

makeBoard('own-board',ownCells,true);makeBoard('enemy-board',enemyCells,false);
ownOcean=new OceanBoard($('own-board'));enemyOcean=new OceanBoard($('enemy-board'));
shotTrails=new ShotTrails();
$('start').addEventListener('click',()=>state.phase==='finished'?reset():startBattle());
$('shuffle').addEventListener('click',()=>{if(state.phase!=='setup')return;state.own=randomFleet();state.manual=false;state.message='Новая расстановка готова';state.help=state.mode==='local'?'Подтвердите расстановку кнопкой «Флот готов».':'Можно выходить в море. Нажмите «Начать бой».';hoverIndex=null;render();});
$('manual').addEventListener('click',()=>{if(state.phase!=='setup')return;state.own=[];state.manual=true;selectedLength=4;state.message='Расставьте свой флот';state.help='Выберите корабль ниже и нажмите на своё поле. Поворот — кнопка или R.';render();});
$('rotate').addEventListener('click',toggleRotation);
$('new-game').addEventListener('click',()=>requestRestart('restart'));
$('menu-button').addEventListener('click',()=>requestRestart('menu'));
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();requestRestart('menu');});
$('confirm-restart').addEventListener('click',()=>{$('restart-dialog').close();if(restartAction==='menu')showMenu();else reset();});
$('choose-computer').addEventListener('click',()=>reset('computer'));
$('choose-friend').addEventListener('click',()=>$('friend-dialog').showModal());
$('choose-lan').addEventListener('click',openLanDialog);
$('lan-create').addEventListener('click',()=>connectLan('create'));
$('lan-spectate').addEventListener('click',()=>connectLan('spectate'));
$('lan-form').addEventListener('submit',event=>{event.preventDefault();void connectLan('join');});
$('lan-room-address').addEventListener('click',()=>$('lan-room-address').select());
$('friend-form').addEventListener('submit',event=>{event.preventDefault();const names=[$('player-one-name').value,$('player-two-name').value];$('friend-dialog').close();reset('local',names);});
$('reveal-player').addEventListener('click',()=>{revealPlayer(state);selectedLength=4;vertical=false;hoverIndex=null;render();focusCurrentScreen();});
$('rules').addEventListener('click',()=>$('rules-dialog').showModal());
$('show-history').addEventListener('click',openHistory);
$('show-result-history').addEventListener('click',openHistory);
$('history-more').addEventListener('click',()=>{historyVisibleLimit+=20;renderHistory();});
window.addEventListener('storage',event=>{if(event.key==='morskoy-boy.match-history.v1'||event.key===null){refreshHistoryCount();if($('history-dialog').open)renderHistory();}});
$('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound').setAttribute('aria-pressed',String(soundEnabled));$('sound').textContent=`Звук: ${soundEnabled?'вкл.':'выкл.'}`;if(soundEnabled)beep('miss');});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
document.addEventListener('keydown',event=>{if(!document.querySelector('dialog[open]')&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['r','к'].includes(event.key.toLowerCase())){event.preventDefault();toggleRotation();}});
render();
if(lanClient.enabled){
  const nativeDownloads=$('native-downloads');if(nativeDownloads)nativeDownloads.hidden=true;
  const offlineDownload=$('offline-download');if(offlineDownload)offlineDownload.hidden=true;
  void fetch('/api/lan-info',{cache:'no-store'}).then(response=>response.json()).then(info=>{lanAddresses=info.addresses||[];if(state.mode==='lan')render();}).catch(()=>{});
  lanClient.resume();
}

function visibleState() {
  if(state.mode==='lan')return {mode:'lan',phase:state.phase,room:lanSnapshot.code,currentPlayer:state.players[state.currentPlayer],turn:state.turn,message:state.message,ownShipsRemaining:remaining(state.own,state.ownShots),enemyShipsRemaining:state.enemyRemaining,shotsFired:state.shots,hits:state.hits,enemyField:state.enemyShots.flatMap((result,index)=>result?[{coordinate:coord(index),result}]:[])};
  return visibleSession(state);
}
const modelContext=document.modelContext;
if(modelContext?.registerTool) {
  const lifecycle=new AbortController();
  const definitions=[
    {name:'get_battleship_match_history',title:'История матчей',description:'Read completed match results saved in this browser. Returns dates, opponents, winners and shooting statistics. Does not expose an unfinished game.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>{const matches=matchHistory.list();return {matches,storageAvailable:!matchHistory.issue};}},
    {name:'get_battleship_state',title:'Состояние морского боя',description:'Read the visible game state without revealing hidden enemy ships.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>visibleState()},
    {name:'start_battleship_battle',title:'Начать бой против компьютера',description:'Start a computer battle using the currently complete fleet. Only available in computer setup; local players confirm their private fleet through the visible interface.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(state.mode!=='computer')throw new Error('Подтвердите расстановку в интерфейсе игры.');startBattle();return visibleState();}},
    {name:'select_battleship_mode',title:'Выбрать режим игры',description:'From the main menu, choose a computer opponent or two local players on one shared device. Local mode opens the private device handoff screen.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['computer','local']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(state.phase!=='menu'||!input||!['computer','local'].includes(input.mode))throw new Error('Выберите допустимый режим в главном меню.');reset(input.mode);return visibleState();}},
    {name:'fire_battleship_shot',title:'Выстрел',description:'Fire one shot on the active player turn. A miss starts the computer turn or hides both boards for local device handoff. This tool cannot reveal the next player field.',inputSchema:{type:'object',properties:{column:{type:'integer',minimum:1,maximum:10},row:{type:'integer',minimum:1,maximum:10}},required:['column','row'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||!Number.isInteger(input.column)||!Number.isInteger(input.row)||input.column<1||input.column>10||input.row<1||input.row>10)throw new Error('column and row must be integers from 1 to 10.');if(!await playerFire((input.row-1)*10+input.column-1))throw new Error('Выстрел недоступен: дождитесь своего хода и выберите непроверенную клетку.');return visibleState();}}
  ];
  for(const tool of definitions){try{void Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();},{once:true});
}


startUpdateStatus(() => state.phase === 'menu' && !document.querySelector('dialog[open]'));
