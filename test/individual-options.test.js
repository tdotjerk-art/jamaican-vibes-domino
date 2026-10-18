const test=require('node:test'),assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');const {server,io}=require('../server');
const wait=(s,e,p=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(e,fn);reject(Error('Timeout '+e));},3000);function fn(d){if(!p(d))return;clearTimeout(timer);s.off(e,fn);resolve(d);}s.on(e,fn);});
test('online room creation and host options share the chosen individual tie version with all players',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 const client=async()=>{const s=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});clients.push(s);await wait(s,'connect');return s;};
 try{
  const host=await client(),seat=wait(host,'seat-assigned'),initial=wait(host,'room-state');
  host.emit('create-room',{name:'Host',mode:'individual',target:20,tieRule:'last-winner-one'});const assigned=await seat,state=await initial;
  assert.equal(state.target,6);assert.equal(state.tieRule,'last-winner-one');assert.equal(state.mode,'individual');
  const guest=await client(),joined=wait(guest,'room-state');guest.emit('join-room',{name:'Guest',code:assigned.code});assert.equal((await joined).tieRule,'last-winner-one');
  const changed=wait(guest,'room-state',s=>s.tieRule==='double-six-two');host.emit('set-room-options',{mode:'individual',target:12,tieRule:'double-six-two'});const next=await changed;assert.equal(next.target,6);assert.equal(next.tieRule,'double-six-two');
 }finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
});
