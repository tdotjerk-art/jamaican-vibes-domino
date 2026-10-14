const test=require('node:test');
const assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
process.env.DATABASE_PATH=':memory:';
const {server,io,membership}=require('../server');

const event=(socket,name,predicate=()=>true)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.off(name,on);reject(new Error('Timeout: '+name));},4000);
  function on(data){if(predicate(data)){clearTimeout(timer);socket.off(name,on);resolve(data);}}
  socket.on(name,on);
});

test('socket revocation and spectator transitions',async t=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`,clients=[];
  t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));membership.db.close();});
  const make=async cookie=>{
    const socket=connect(url,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:cookie?{Cookie:cookie}:{}});
    clients.push(socket);await event(socket,'connect');return socket;
  };
  const action=async(socket,name,data,result)=>{const next=event(socket,result);socket.emit(name,data);return next;};
  const api=async(route,body,cookie='')=>{
    const response=await fetch(url+'/api/'+route,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };

  await t.test('recovery disconnects all account sockets, pauses play, and permits only the new session to reclaim the seat',async()=>{
    const credentials={email:'revoke@example.com',name:'Owner',password:'original-password-123'};
    const registered=await api('register',credentials),otherSession=await api('login',credentials);
    const owner=await make(registered.cookie),second=await make(otherSession.cookie);
    const assigned=await action(owner,'create-room',{name:'Owner'},'seat-assigned');
    await action(second,'join-spectator',{code:assigned.code},'spectator-assigned');
    const guests=[];
    for(let n=0;n<3;n++){
      const guest=await make();guests.push(guest);
      await action(guest,'join-room',{name:'Guest '+n,code:assigned.code},'seat-assigned');
    }
    const playing=event(owner,'private-state',s=>s.phase==='playing');
    [owner,...guests].forEach(s=>s.emit('toggle-ready'));await playing;
    const revoked=[event(owner,'session-revoked'),event(second,'session-revoked')];
    const disconnected=[event(owner,'disconnect'),event(second,'disconnect')];
    const paused=event(guests[0],'private-state',s=>s.phase==='paused'&&!s.players[0].connected);
    const recovered=await api('recover',{...credentials,recoveryCode:registered.body.recoveryCode,password:'replacement-password-123'});
    assert.equal(recovered.status,200);await Promise.all([...revoked,...disconnected,paused]);
    assert.equal(owner.connected,false);assert.equal(second.connected,false);assert.equal(guests[0].connected,true);
    let privateUpdates=0;owner.on('private-state',()=>privateUpdates++);
    const stale=await make(registered.cookie);
    assert.match(await action(stale,'reconnect-player',{roomCode:assigned.code,token:assigned.token},'room-error'),/Sign in/);
    const replacement=await make(recovered.cookie),resumed=event(guests[0],'private-state',s=>s.phase==='playing');
    assert.equal((await action(replacement,'reconnect-player',{roomCode:assigned.code,token:assigned.token},'reconnect-ok')).seat,0);
    await resumed;assert.equal(privateUpdates,0,'revoked socket must receive no more private hands');
    const waiting=event(guests[0],'private-state',s=>s.phase==='waiting');replacement.emit('leave-room');await waiting;
    for(const guest of guests)guest.emit('leave-room');
  });

  await t.test('logout revokes only sockets using that session',async()=>{
    const credentials={email:'logout@example.com',name:'Owner',password:'original-password-123'};
    const registered=await api('register',credentials),otherSession=await api('login',credentials);
    const owner=await make(registered.cookie),sameSession=await make(registered.cookie),other=await make(otherSession.cookie);
    const assigned=await action(owner,'create-room',{name:'Owner'},'seat-assigned');
    await action(sameSession,'join-spectator',{code:assigned.code},'spectator-assigned');
    await action(other,'join-spectator',{code:assigned.code},'spectator-assigned');
    const disconnected=[event(owner,'disconnect'),event(sameSession,'disconnect')];
    const result=await api('logout',{},registered.cookie);assert.equal(result.status,200);await Promise.all(disconnected);
    assert.equal(other.connected,true);
    const replacement=await make(otherSession.cookie);
    assert.equal((await action(replacement,'reconnect-player',{roomCode:assigned.code,token:assigned.token},'reconnect-ok')).seat,0);
    await action(other,'create-room',{name:'Still signed in'},'seat-assigned');
    replacement.emit('leave-room');other.emit('leave-room');
  });

  await t.test('expired authenticated sockets cannot continue issuing player actions',async()=>{
    const registered=await api('register',{email:'expired@example.com',name:'Expired',password:'original-password-123'});
    const owner=await make(registered.cookie);await action(owner,'create-room',{name:'Expired'},'seat-assigned');
    membership.db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(registered.body.user.id);
    const revoked=event(owner,'session-revoked'),disconnected=event(owner,'disconnect');owner.emit('toggle-ready');
    await Promise.all([revoked,disconnected]);assert.equal(owner.connected,false);
  });

  await t.test('spectator switching, joining, reconnecting, creating and leaving clean up previous roles',async()=>{
    const hostA=await make(),hostB=await make(),watcher=await make();
    const a=await action(hostA,'create-room',{name:'Host A'},'seat-assigned');
    const b=await action(hostB,'create-room',{name:'Host B'},'seat-assigned');
    await action(watcher,'join-spectator',{code:a.code},'spectator-assigned');
    let clean=event(hostA,'room-state',s=>s.spectatorCount===0);
    await action(watcher,'join-spectator',{code:b.code},'spectator-assigned');await clean;
    const seated=event(hostB,'room-state',s=>s.players[1]?.name==='Player'&&s.spectatorCount===0);
    const assigned=await action(watcher,'join-room',{name:'Player',code:b.code},'seat-assigned');await seated;assert.equal(assigned.seat,1);
    clean=event(hostB,'room-state',s=>s.players[1]===null);watcher.emit('leave-room');await clean;
    const rejoined=await action(watcher,'join-room',{name:'Player',code:b.code},'seat-assigned');assert.equal(rejoined.seat,1);
    const disconnected=event(hostB,'room-state',s=>s.players[1]?.connected===false);watcher.disconnect();await disconnected;
    const replacement=await make();await action(replacement,'join-spectator',{code:a.code},'spectator-assigned');
    clean=event(hostA,'room-state',s=>s.spectatorCount===0);
    assert.equal((await action(replacement,'reconnect-player',{roomCode:b.code,token:rejoined.token},'reconnect-ok')).seat,1);await clean;
    clean=event(hostB,'room-state',s=>s.players[1]===null);replacement.emit('leave-room');await clean;
    await action(replacement,'join-spectator',{code:a.code},'spectator-assigned');
    clean=event(hostA,'room-state',s=>s.spectatorCount===0);
    const created=await action(replacement,'create-room',{name:'New host'},'seat-assigned');await clean;
    const observer=await make();await action(observer,'join-spectator',{code:created.code},'spectator-assigned');
    clean=event(observer,'room-state',s=>s.players[0]?.connected===false);replacement.disconnect();await clean;
  });
});
