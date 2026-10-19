const test=require('node:test'),assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');const {server,io}=require('../server');
const wait=(s,event,p=()=>true)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>{s.off(event,fn);reject(Error('Timeout '+event));},4000);function fn(d){if(!p(d))return;clearTimeout(t);s.off(event,fn);resolve(d);}s.on(event,fn);});
test('online consensus, private hands, turn enforcement, reconnect and session extension',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const all=[];let seats=[];
 const client=async()=>{const s=connect(`http://127.0.0.1:${server.address().port}/three-cards`,{transports:['websocket'],forceNew:true});s.on('state',d=>s.current=d);all.push(s);await wait(s,'connect');return s;};
 const command=async(s,event,data)=>{await new Promise(r=>setTimeout(r,55));const updates=seats.filter(p=>p.connected).map(p=>wait(p,'state'));s.emit(event,data);await Promise.all(updates);};
 try{
  const a=await client();let identity=wait(a,'assigned'),state=wait(a,'state');a.emit('create',{name:'Host',total:5});const hostId=await identity;await state;
  let b=await client();identity=wait(b,'assigned');state=wait(b,'state');b.emit('join',{code:hostId.code,name:'Guest',total:10});const guestId=await identity;await state;seats=[a,b];
  await command(a,'ready');await command(b,'ready');let err=wait(a,'card-error');a.emit('start');assert.match(await err,/same game count/);
  await command(b,'choice',{total:5});assert(a.current.seats.every(p=>!p.ready));await command(a,'ready');await command(b,'ready');await command(a,'start');
  let guard=0;while(a.current.game.phase==='pick'&&guard++<20){const g=a.current.game,seat=g.pickSeats.find(i=>!g.picks[i]);await command(seats[seat],'action',{type:'pick'});}
  assert.equal(a.current.game.phase,'deal');const dealer=a.current.game.dealer;
  err=wait(seats[1-dealer],'card-error');seats[1-dealer].emit('action',{type:'deal'});assert.match(await err,/not available/);
  await command(seats[dealer],'action',{type:'deal'});
  assert.equal(a.current.game.players[0].hand.length,3);assert.equal(a.current.game.players[1].hand.length,0);assert.equal(b.current.game.players[1].hand.length,3);assert.equal(b.current.game.players[0].hand.length,0);assert.equal(a.current.game.stock,undefined);
  state=wait(a,'state',s=>!s.seats[1].connected);b.disconnect();await state;err=wait(a,'card-error');a.emit('action',{type:'draw'});assert.match(await err,/paused/);
  b=await client();identity=wait(b,'assigned');state=wait(b,'state');b.emit('resume',guestId);await identity;await state;seats=[a,b];assert(b.current.game);assert.equal(b.current.seat,1);
  guard=0;while(a.current.game.phase!=='session-over'&&guard++<2000){const g=a.current.game;let seat,data;
   if(g.phase==='pick'){seat=g.pickSeats.find(i=>!g.picks[i]);data={type:'pick'};}
   else if(g.phase==='deal'){seat=g.dealer;data={type:'deal'};}
   else if(g.phase==='draw'){seat=g.turn;data={type:'draw'};}
   else if(g.phase==='offer'){seat=g.turn;const h=seats[seat].current.game.players[seat].hand,m=h.find(c=>c.rank===g.top.rank),o=h.find(c=>c!==m);data={type:'play',match:m.id,other:o?.id};}
   else{seat=0;data={type:'next'};}await command(seats[seat],'action',data);
  }
  assert.equal(a.current.game.completed,5);assert.equal(a.current.game.phase,'session-over');const scores=a.current.game.players.map(p=>p.score);
  await command(a,'extend',{amount:5});assert.equal(a.current.game.phase,'session-over');await command(b,'extend',{amount:10});assert.equal(a.current.game.phase,'session-over');await command(b,'extend',{amount:5});assert.equal(a.current.game.total,10);assert.deepEqual(a.current.game.players.map(p=>p.score),scores);assert.notEqual(a.current.game.phase,'session-over');
 }finally{all.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
});
