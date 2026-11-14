const test=require('node:test'),assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
const {server,io,canPlay,ends}=require('../server');
const wait=(s,event,p=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(event,fn);reject(Error('Timeout '+event));},6000);function fn(d){if(p(d)){clearTimeout(timer);s.off(event,fn);resolve(d);}}s.on(event,fn);});
test('selected domino table sizes enforce seats, finish hands, and reconnect',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 async function client(){const s=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],forceNew:true});clients.push(s);s.on('private-state',state=>s.current=state);await wait(s,'connect');return s;}
 try{for(const count of [2,3,4]){
  const seats=[],tokens=[];
  for(let i=0;i<count;i++){const s=await client();seats.push(s);const assigned=wait(s,'seat-assigned');s.emit(i?'join-room':'create-room',{name:'P'+i,code:tokens[0]?.code,mode:'individual',playerCount:count});tokens.push(await assigned);}
  const extra=await client(),full=wait(extra,'room-error');extra.emit('join-room',{name:'Extra',code:tokens[0].code});assert.match(await full,/full/);extra.disconnect();
  const playing=wait(seats[0],'private-state',s=>s.phase==='playing');for(const s of seats)s.emit('toggle-ready');const state=await playing;
  assert.equal(state.playerCount,count);assert.equal(state.handCounts.length,count);assert.equal(state.board[0].a,6);assert.equal(state.board[0].b,6);assert.equal(state.handCounts.reduce((a,b)=>a+b,0)+1,count*7);
  const paused=wait(seats[0],'private-state',s=>s.phase==='paused');seats[1].disconnect();await paused;
  const replacement=await client(),resumed=wait(seats[0],'private-state',s=>s.phase==='playing');replacement.emit('reconnect-player',{roomCode:tokens[0].code,token:tokens[1].token});await resumed;seats[1]=replacement;
  await new Promise(r=>setTimeout(r,Math.max(0,seats[0].current.dealUntil-Date.now())+25));
  let guard=0;while(seats[0].current.phase==='playing'&&guard++<28){const state=seats[0].current;assert(state.turn>=0&&state.turn<count);const s=seats[state.turn],tile=s.current.hand.find(t=>canPlay(state.board,t));assert(tile);const [left]=ends(state.board),update=wait(seats[0],'private-state',x=>x.board.length>state.board.length);s.emit('play-domino',{tileId:tile.id,side:tile.a===left||tile.b===left?'left':'right'});await update;await new Promise(r=>setTimeout(r,60));}
  assert.notEqual(seats[0].current.phase,'playing');assert(seats[0].current.scores.every(Number.isFinite));for(const s of seats)s.disconnect();
 }}finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
});
