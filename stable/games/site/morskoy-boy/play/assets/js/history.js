"use strict";
(() => {
const MATCH_HISTORY_KEY = 'morskoy-boy.match-history.v1';

function summarizeMatch(session) {
  if(session.phase!=='finished')throw new Error('В историю попадают только завершённые матчи.');
  const players=session.players.map((name,index)=>{
    const shots=session.log.filter(shot=>shot.shooter===index);
    return {name,shots:shots.length,hits:shots.filter(shot=>shot.type!=='miss').length,sunk:shots.filter(shot=>shot.type==='sunk').length};
  });
  return {id:session.matchId,mode:session.mode,ruleset:session.ruleset||'classic',startedAt:session.startedAt,endedAt:session.endedAt,winnerIndex:session.winner==='ai'?1:session.currentPlayer,players};
}

function validMatch(record) {
  return record&&typeof record.id==='string'&&record.id.length>0&&['computer','local','lan'].includes(record.mode)
    &&Number.isFinite(Date.parse(record.startedAt))&&Number.isFinite(Date.parse(record.endedAt))
    &&[0,1].includes(record.winnerIndex)&&Array.isArray(record.players)&&record.players.length===2
    &&record.players.every(player=>player&&typeof player.name==='string'&&player.name.length<=80
      &&Number.isInteger(player.shots)&&player.shots>=0&&player.shots<=100
      &&Number.isInteger(player.hits)&&player.hits>=0&&player.hits<=Math.min(20,player.shots)
      &&Number.isInteger(player.sunk)&&player.sunk>=0&&player.sunk<=10);
}

function combineMatches(...collections) {
  return [...new Map(collections.flat().map(record=>[record.id,record])).values()]
    .sort((a,b)=>Date.parse(b.endedAt)-Date.parse(a.endedAt)||a.id.localeCompare(b.id));
}

// Both the website and standalone HTML use this browser's own storage.
// Unwritten results remain in memory if the browser rejects persistence.
function createMatchHistory(storageProvider=()=>globalThis.localStorage) {
  let cached=[],pending=[],issue=null;
  function readStored() {
    const storage=storageProvider();
    if(!storage)throw new Error('Storage unavailable');
    const raw=storage.getItem(MATCH_HISTORY_KEY);
    if(raw===null)return [];
    const parsed=JSON.parse(raw);
    if(parsed?.version!==1||!Array.isArray(parsed.matches)||!parsed.matches.every(validMatch))throw new Error('Invalid stored history');
    return parsed.matches;
  }
  function list() {
    try{cached=combineMatches(readStored(),pending);issue=pending.length?'write':null;}
    catch{cached=combineMatches(cached,pending);issue='read';}
    return cached.slice();
  }
  function save(record) {
    if(!validMatch(record))throw new Error('Некорректный результат матча.');
    pending=combineMatches(pending,[JSON.parse(JSON.stringify(record))]);
    let stored;
    try{stored=readStored();}
    catch{cached=combineMatches(cached,pending);issue='read';return {saved:false};}
    cached=combineMatches(stored,pending);
    try{storageProvider().setItem(MATCH_HISTORY_KEY,JSON.stringify({version:1,matches:cached}));pending=[];issue=null;return {saved:true};}
    catch{issue='write';return {saved:false};}
  }
  return {list,save,get issue(){return issue;}};
}



window.BattleshipHistory = Object.freeze({summarizeMatch,validMatch,combineMatches,createMatchHistory});
})();
