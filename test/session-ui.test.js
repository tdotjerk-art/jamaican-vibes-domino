const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('revocation shows a sign-in message and manual reconnect opens a fresh authenticated connection',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match=>match[1]).find(source=>source.includes('function ensureSocket()'));
  assert.ok(script);
  const elements=new Map(),storage=new Map(),handlers=new Map(),actions=[];
  let cookie='old-session';
  const element=id=>{
    if(!elements.has(id))elements.set(id,{style:{},value:'',textContent:'',addEventListener(){}});
    return elements.get(id);
  };
  const socket={on:(name,handler)=>handlers.set(name,handler),io:{on(){}},
    disconnect:()=>actions.push(['disconnect']),connect:()=>actions.push(['connect',cookie]),
    emit:(name,payload)=>actions.push(['emit',name,payload])};
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const window={addEventListener(){}};
  vm.runInNewContext(script,{document:{getElementById:element},window,localStorage,
    io:()=>socket,setTimeout:()=>0,clearTimeout(){}});
  element('jvName').value='Player';element('jvCreate').onclick();
  const saved={roomCode:'ABC123',token:'saved-seat-token'};
  storage.set('jvReconnect',JSON.stringify(saved));
  handlers.get('session-revoked')('Sign in again to reconnect to your seat.');
  assert.equal(element('jvSetupStatus').textContent,'Sign in again to reconnect to your seat.');
  assert.equal(element('jvOnlineSetup').style.display,'flex');
  assert.equal(storage.get('jvReconnect'),JSON.stringify(saved),'keep the seat token for recovery');
  cookie='new-session';actions.length=0;element('jvReconnect').onclick();
  assert.deepEqual(actions.slice(0,2),[['disconnect'],['connect','new-session']]);
  assert.equal(actions[2][1],'reconnect-player');
  assert.equal(JSON.stringify(actions[2][2]),JSON.stringify(saved));
});
