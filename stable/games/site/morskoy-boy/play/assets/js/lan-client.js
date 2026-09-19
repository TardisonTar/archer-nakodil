"use strict";
(() => {
function createLanClient(onSnapshot,onConnection) {
  const enabled=!!document.querySelector('meta[name="battleship-lan-server"]');
  const key='morskoy-boy.lan-session.v2';
  let credentials=null,pollTimer=null,reconnectTimer=null,generation=0,busy=false,lastVersion=-1;
  let socket=null,retry=0;
  const cache=value=>{try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}};

  async function request(path,body,auth=credentials) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try {
      const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,
        headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:`Bearer ${auth.token}`}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json();
      if(!response.ok){const error=new Error(result.error||'Сервер отклонил запрос.');error.status=response.status;throw error;}
      return result;
    } finally {clearTimeout(timeout);}
  }

  function accept(snapshot) {
    if(!snapshot||!Number.isInteger(snapshot.version)||snapshot.version<lastVersion)return;
    lastVersion=snapshot.version;onSnapshot(snapshot);
  }

  function clearRealtime() {
    clearTimeout(pollTimer);clearTimeout(reconnectTimer);pollTimer=null;reconnectTimer=null;
    if(socket){const old=socket;socket=null;try{old.onopen=old.onmessage=old.onerror=old.onclose=null;old.close();}catch{}}
  }

  async function pollFallback(ticket=generation) {
    clearTimeout(pollTimer);
    if(!credentials||ticket!==generation||socket?.readyState===WebSocket.OPEN)return;
    try {
      const snapshot=await request(`/api/state?code=${encodeURIComponent(credentials.code)}`);
      if(ticket!==generation)return;onConnection(true,'');accept(snapshot);
    } catch(error) {
      if(ticket!==generation)return;
      onConnection(false,error.status===401||error.status===404?error.message:'WebSocket недоступен. Используется резервное HTTP-соединение…');
      if(error.status===401||error.status===404){cache(null);credentials=null;return;}
    }
    if(ticket===generation&&credentials&&socket?.readyState!==WebSocket.OPEN)pollTimer=setTimeout(()=>pollFallback(ticket),3000);
  }

  function openSocket(ticket=generation) {
    clearTimeout(reconnectTimer);
    if(!enabled||!credentials||ticket!==generation||!['http:','https:'].includes(location.protocol)){
      void pollFallback(ticket);return;
    }
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    const url=`${protocol}//${location.host}/ws?code=${encodeURIComponent(credentials.code)}&token=${encodeURIComponent(credentials.token)}`;
    try{socket=new WebSocket(url);}catch{socket=null;void pollFallback(ticket);return;}
    const current=socket;
    current.onopen=()=>{
      if(ticket!==generation||current!==socket)return;
      retry=0;clearTimeout(pollTimer);onConnection(true,'');
    };
    current.onmessage=event=>{
      if(ticket!==generation||current!==socket)return;
      try{const message=JSON.parse(event.data);if(message.type==='snapshot')accept(message.snapshot);}catch{}
    };
    current.onerror=()=>{};
    current.onclose=event=>{
      if(ticket!==generation||current!==socket)return;
      socket=null;
      if(!credentials)return;
      if(event.code===4401||event.code===4404){cache(null);credentials=null;onConnection(false,'Сессия локальной сети завершена.');return;}
      onConnection(false,'Связь по WebSocket потеряна. Восстанавливаем…');
      void pollFallback(ticket);
      const delay=Math.min(10000,700*2**Math.min(retry++,4));
      reconnectTimer=setTimeout(()=>openSocket(ticket),delay);
    };
  }

  async function connect(action,name,code='') {
    if(!enabled)throw new Error('Откройте игру через локальный сервер.');
    const result=await request(`/api/${action}`,{name,code},null);
    generation++;clearRealtime();lastVersion=-1;retry=0;
    credentials={code:result.code,token:result.token};cache(credentials);
    onConnection(true,'');accept(result.snapshot);openSocket(generation);return result.snapshot;
  }

  async function action(name,data={}) {
    if(!credentials||busy)throw new Error('Дождитесь завершения предыдущего действия.');
    busy=true;const ticket=generation;
    try {
      // Commands remain HTTP so every action has an explicit request/response acknowledgement.
      // State propagation to both players is push-based over WebSocket.
      const snapshot=await request(`/api/${name}`,{...data,code:credentials.code});
      if(ticket===generation){onConnection(true,'');accept(snapshot);}return snapshot;
    } catch(error) {
      if(ticket===generation)onConnection(!(!error.status),error.status?error.message:'Не удалось связаться с сервером. Проверяем состояние комнаты…');
      throw error;
    } finally {busy=false;if(ticket===generation&&socket?.readyState!==WebSocket.OPEN)void pollFallback(ticket);}
  }

  function forget(){generation++;clearRealtime();credentials=null;lastVersion=-1;retry=0;cache(null);}
  async function leave(){const previous=credentials;forget();if(previous){try{await request('/api/leave',{code:previous.code},previous);}catch{}}}
  function resume(){
    if(!enabled)return;
    try {
      const saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(saved&&typeof saved.code==='string'&&typeof saved.token==='string'){
        credentials=saved;generation++;onConnection(false,'Возвращаемся в комнату…');openSocket(generation);
      }
    } catch{cache(null);}
  }
  return {enabled,connect,action,leave,resume,get active(){return !!credentials;},get busy(){return busy;},get realtime(){return socket?.readyState===WebSocket.OPEN;}};
}
window.BattleshipLan = Object.freeze({createLanClient});
})();
