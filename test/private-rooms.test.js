const test=require('node:test');
const assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
process.env.DATABASE_PATH=':memory:';
const {server,io,membership}=require('../server');
const event=(s,name,predicate=()=>true)=>new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{s.off(name,on);reject(new Error('Timeout: '+name));},3000);
  function on(d){if(predicate(d)){clearTimeout(t);s.off(name,on);resolve(d);}}s.on(name,on);
});
test('VIP rooms enforce passwords and seat ownership while allowing free guests',async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`,clients=[];
  const make=async cookie=>{const s=connect(url,{transports:['websocket'],forceNew:true,extraHeaders:cookie?{Cookie:cookie}:{}});clients.push(s);await event(s,'connect');return s;};
  try{
    const guest=await make();let next=event(guest,'room-error');guest.emit('create-room',{name:'Guest',password:'secret123'});
    assert.match(await next,/VIP/);
    const registered=await fetch(url+'/api/register',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'host@example.com',name:'Host',password:'long-secure-password'})});
    const account=await registered.json(),cookie=registered.headers.get('set-cookie').split(';')[0];
    membership.db.prepare('INSERT INTO subscriptions VALUES(?,?,?,?)').run('sub_test',account.user.id,'active',Math.floor(Date.now()/1000)+86400);
    const host=await make(cookie);next=event(host,'seat-assigned');host.emit('create-room',{name:'Host',password:'secret123'});const assigned=await next;
    next=event(guest,'room-error');guest.emit('join-room',{name:'Guest',code:assigned.code,password:'incorrect'});assert.match(await next,/incorrect/);
    next=event(guest,'room-error');guest.emit('join-spectator',{code:assigned.code});assert.match(await next,/incorrect/);
    next=event(guest,'seat-assigned');guest.emit('join-room',{name:'Guest',code:assigned.code,password:'secret123'});assert.equal((await next).seat,1);
    next=event(guest,'room-error');guest.emit('create-room',{name:'Guest'});assert.match(await next,/Leave/);
    const attacker=await make();next=event(attacker,'room-error');attacker.emit('reconnect-player',{roomCode:assigned.code,token:assigned.token});assert.match(await next,/already connected/);
    const disconnected=event(guest,'private-state',s=>s.players[0]?.connected===false);host.disconnect();await disconnected;
    next=event(attacker,'room-error');attacker.emit('reconnect-player',{roomCode:assigned.code,token:assigned.token});assert.match(await next,/Sign in/);
    const replacement=await make(cookie);next=event(replacement,'reconnect-ok');replacement.emit('reconnect-player',{roomCode:assigned.code,token:assigned.token});assert.equal((await next).seat,0);
    next=event(attacker,'action-error');attacker.emit('create-room',null);assert.match(await next,/Invalid/);
    assert.equal((await fetch(url+'/health')).status,200,'malformed actions must not crash the service');
  }finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));membership.db.close();}
});
