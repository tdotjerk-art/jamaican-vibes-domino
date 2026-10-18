const test=require('node:test'),assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
const {server,io}=require('../server');
const wait=(s,event,p=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(event,handler);reject(Error('Timeout: '+event));},3000);function handler(d){if(!p(d))return;clearTimeout(timer);s.off(event,handler);resolve(d);}s.on(event,handler);});
const join=s=>new Promise(resolve=>s.emit('voice-join',{},resolve));
test('voice is limited to seated, opted-in players in the same room, with cleanup on leave and disconnect',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 async function client(){const s=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});clients.push(s);await wait(s,'connect');return s;}
 try{
  const a=await client(),assigned=wait(a,'seat-assigned');a.emit('create-room',{name:'One',mode:'partner'});const room=await assigned;
  const players=[a];for(let i=1;i<4;i++){const s=await client(),ready=wait(s,'seat-assigned');s.emit('join-room',{name:'P'+(i+1),code:room.code});await ready;players.push(s);}
  for(const s of players)assert.ok((await join(s)).self);
  const roster=wait(a,'voice-roster',r=>r.peers.length===4&&r.peers.find(p=>p.id===players[3].id)?.muted);players[3].emit('voice-mute',{muted:true});assert.equal((await roster).peers.find(p=>p.id===players[3].id).muted,true);
  const spectator=await client(),watched=wait(spectator,'spectator-assigned');spectator.emit('join-spectator',{code:room.code});await watched;assert.ok((await join(spectator)).error);
  const outsider=await client(),created=wait(outsider,'seat-assigned');outsider.emit('create-room',{name:'Outside'});await created;await join(outsider);
  let leaked=0;outsider.on('voice-signal',()=>leaked++);spectator.on('voice-signal',()=>leaked++);
  a.emit('voice-signal',{to:outsider.id,description:{type:'offer',sdp:'other room'}});
  spectator.emit('voice-signal',{to:a.id,description:{type:'offer',sdp:'spectator'}});
  const received=wait(players[1],'voice-signal');a.emit('voice-signal',{to:players[1].id,description:{type:'offer',sdp:'same room'}});
  assert.deepEqual(await received,{from:a.id,description:{type:'offer',sdp:'same room'}});
  const left=wait(a,'voice-roster',r=>r.peers.length===3);players[3].emit('voice-leave');await left;
  assert.equal(leaked,0);
  const disconnected=wait(a,'voice-roster',r=>r.peers.length===2);players[2].disconnect();await disconnected;
  const exited=wait(a,'voice-roster',r=>r.peers.length===1);players[1].emit('leave-room');await exited;
  assert.ok((await join(players[1])).error);
 }finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
});

test('TURN REST configuration generates temporary credentials without exposing the secret',()=>{
 const {iceConfig}=require('../voice');
 const keys=['VOICE_TURN_URLS','VOICE_TURN_SECRET','VOICE_TURN_USERNAME','VOICE_TURN_CREDENTIAL'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  process.env.VOICE_TURN_URLS='turns:relay.example.test:443';process.env.VOICE_TURN_SECRET='test-only-secret';
  const config=iceConfig();assert.equal(config.relayConfigured,true);
  const turn=config.iceServers[1];assert.match(turn.username,/^\d+:domino$/);assert.ok(turn.credential);
  assert.ok(!JSON.stringify(config).includes('test-only-secret'));
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
