const test=require('node:test'),assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
const {server,io}=require('../server');
const wait=(s,event,p=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(event,fn);reject(Error('Timeout '+event));},3000);function fn(d){if(!p(d))return;clearTimeout(timer);s.off(event,fn);resolve(d);}s.on(event,fn);});

test('Domino role transitions release old seats and spectators cannot act as players',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 const client=async()=>{const s=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});clients.push(s);await wait(s,'connect');return s;};
 const create=async(s,name)=>{const p=wait(s,'seat-assigned');s.emit('create-room',{name});return p;};
 try{
  const a=await client(),b=await client(),watcher=await client();
  const first=await create(a,'A'),second=await create(b,'B');
  let p=wait(a,'spectator-assigned');a.emit('join-spectator',{code:second.code});await p;
  // Reusing A must no longer orphan A's connected seat in the first room.
  p=wait(watcher,'room-state',r=>r.code===first.code);watcher.emit('join-spectator',{code:first.code});
  assert.equal((await p).players[0],null);
  let assigned=wait(a,'seat-assigned');a.emit('join-room',{name:'A',code:second.code});await assigned;
  p=wait(b,'room-state',r=>r.players[1]?.ready);a.emit('toggle-ready');const ready=await p;
  assert.equal(ready.spectatorCount,0);
  p=wait(b,'room-state',r=>!r.players[1]);a.emit('leave-room');await p;
  p=wait(b,'spectator-assigned');b.emit('join-spectator',{code:second.code});await p;
  const error=wait(b,'action-error');b.emit('toggle-ready');assert.match(await error,/player|seat/i);
 }finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
});

test('Domino rejects duplicate connected-seat recovery and malformed room payloads without crashing',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 const client=async()=>{const s=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});clients.push(s);await wait(s,'connect');return s;};
 try{
  const a=await client(),b=await client();let p=wait(a,'seat-assigned');a.emit('create-room',{name:'A'});const seat=await p;
  p=wait(b,'room-error');b.emit('reconnect-player',{roomCode:seat.code,token:seat.token});assert.match(await p,/already connected/i);
  p=wait(b,'room-error');b.emit('join-room',null);assert.match(await p,/request|room|name/i);
  p=wait(a,'room-state',r=>r.players[0]?.ready);a.emit('toggle-ready');assert.equal((await p).players[0].ready,true);
 }finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
});

test('3 Cards rejects malformed commands and remains usable afterward',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const s=connect(`http://127.0.0.1:${server.address().port}/three-cards`,{transports:['websocket'],forceNew:true});
 try{
  await wait(s,'connect');
  for(const event of ['create','join','resume','choice','action','extend']){
   const error=wait(s,'card-error');s.emit(event,null);assert.match(await error,/Invalid table request/);
  }
  const assigned=wait(s,'assigned');s.emit('create',{name:'Junior',total:5});assert.ok((await assigned).token);
 }finally{s.disconnect();await new Promise(r=>io.close(r));}
});

test('Domino stops processing actions once the per-socket limit is reached',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const s=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});
 try{
  await wait(s,'connect');const initial=wait(s,'room-state');s.emit('create-room',{name:'A'});await initial;
  let changes=0,blocked=0;s.on('room-state',()=>changes++);
  const finished=wait(s,'action-error',()=>++blocked===6);
  for(let n=0;n<35;n++)s.emit('toggle-ready');await finished;
  assert.equal(changes,29);
 }finally{s.disconnect();await new Promise(r=>io.close(r));}
});
