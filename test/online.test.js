const test=require('node:test');
const assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
const {server,io}=require('../server');

const waitFor=(socket,event,predicate=()=>true,timeout=4000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.off(event,onEvent);reject(new Error(`Timed out waiting for ${event}`));},timeout);
  function onEvent(data){
    if(!predicate(data))return;
    clearTimeout(timer);socket.off(event,onEvent);resolve(data);
  }
  socket.on(event,onEvent);
});

test('four players can start, pause, and reclaim a disconnected seat',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const url=`http://127.0.0.1:${port}`;
  const clients=[];
  const makeClient=()=>{const c=connect(url,{transports:['websocket'],forceNew:true});clients.push(c);return c;};

  try{
    const first=makeClient();
    await waitFor(first,'connect');
    const firstSeat=waitFor(first,'seat-assigned');
    first.emit('create-room',{name:'Player 1',mode:'partner',target:6});
    const room=await firstSeat;

    const seats=[room];
    for(let n=2;n<=4;n++){
      const client=makeClient();
      await waitFor(client,'connect');
      const assigned=waitFor(client,'seat-assigned');
      client.emit('join-room',{name:`Player ${n}`,code:room.code});
      seats.push(await assigned);
    }

    const playing=waitFor(first,'private-state',s=>s.phase==='playing');
    clients.forEach(c=>c.emit('toggle-ready'));
    const started=await playing;
    const remaining=Math.ceil((started.deadline-Date.now())/1000);
    assert.ok(remaining>=19&&remaining<=20,`expected about 20 seconds, received ${remaining}`);

    const paused=waitFor(first,'private-state',s=>s.phase==='paused');
    clients[1].disconnect();
    await paused;

    const replacement=makeClient();
    await waitFor(replacement,'connect');
    const reclaimed=waitFor(replacement,'reconnect-ok');
    const resumed=waitFor(first,'private-state',s=>s.phase==='playing');
    replacement.emit('reconnect-player',{roomCode:room.code,token:seats[1].token});
    assert.equal((await reclaimed).seat,1);
    await resumed;
  }finally{
    clients.forEach(c=>c.disconnect());
    await new Promise(resolve=>io.close(resolve));
  }
});
