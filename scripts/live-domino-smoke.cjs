'use strict';
// Non-destructive live smoke checks. Only private, randomly named rooms.
// This script never joins public matchmaking, registers wallet users, or
// changes scores on a real player's game.
const {io}=require('socket.io-client');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const base=process.env.DOMINO_SMOKE_URL||'https://jamaican-vibes-domino.onrender.com';
const sockets=[];
const report=[];
function wait(socket,event,predicate=()=>true,timeout=20000){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.off(event,listener);reject(Error(event+' timed out'))},timeout);
  function listener(value){if(!predicate(value))return;clearTimeout(timer);socket.off(event,listener);resolve(value)}
  socket.on(event,listener);
 });
}
async function connect(){
 const socket=io(base,{transports:['websocket'],forceNew:true,reconnection:false,timeout:18000});
 sockets.push(socket);
 socket.on('connect_error',error=>console.error('Websocket error:',error.message));
 await wait(socket,'connect',()=>true,20000);
 return socket;
}
async function probe(label,fn){
 try{await fn();report.push({check:label,result:'PASS'})}
 catch(error){report.push({check:label,result:'FAIL',details:error.message})}
}
async function main(){
 await probe('Homepage responds with HTML',async()=>{
  const response=await fetch(base,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,'Unexpected homepage HTTP '+response.status);
  assert.match(response.headers.get('content-type')||'',/html/);
  const html=await response.text();
  assert.match(html,/domino/i);
 });
 await probe('Socket.IO server accepts a connection',async()=>{
  const s=await connect();assert.equal(s.connected,true);s.disconnect();
 });
 await probe('4-player Partners starts and accepts a legal domino move',async()=>{
  const prefix='SmokePartners'+crypto.randomBytes(3).toString('hex');
  const first=await connect();
  const seats=[first],assigned=wait(first,'seat-assigned');
  first.emit('create-room',{name:prefix+'0',mode:'partner',target:6,playerCount:4});
  const room=await assigned;
  for(let n=1;n<4;n++){
    const socket=await connect();
    const seated=wait(socket,'seat-assigned');
    socket.emit('join-room',{code:room.code,name:prefix+n});
    await seated;seats.push(socket);
  }
  // Subscribe BEFORE the ready events: the first playing snapshots contain
  // each player's private hand and may not be sent again until their turn.
  const states=seats.map(()=>null);
  seats.forEach((socket,i)=>socket.on('private-state',x=>{states[i]=x}));
  const playing=wait(first,'private-state',x=>x.phase==='playing');
  seats.forEach(p=>p.emit('toggle-ready'));
  const game=await playing;
  assert.equal(game.mode,'partner');
  assert.equal(game.playerCount,4);
  // During the deal animation moves must be rejected. Wait until playable.
  const intro=Math.max(0,game.dealUntil-Date.now())+125;
  await new Promise(resolve=>setTimeout(resolve,intro));
  const current=states[0]||game;
  const player=seats[current.turn];
  assert.ok(player,'Expected a current player');
  const hand=states[current.turn]?.hand;
  assert.ok(Array.isArray(hand),'Current player hand missing');
  const left=current.board[0].a===current.board[0].b?6:current.board[0].a;
  const right=current.board[current.board.length-1].b;
  const move=hand.find(d=>d.a===left||d.b===left||d.a===right||d.b===right);
  assert.ok(move,'No legal playable domino');
  const update=wait(first,'private-state',x=>x.board.length>current.board.length);
  const side=move.a===left||move.b===left?'left':'right';
  player.emit('play-domino',{tileId:move.id,side});
  const moved=await update;
  assert.ok(moved.board.length>current.board.length);
  seats.forEach(p=>p.disconnect());
 });

 for(const count of [2,3,4]){
  await probe('Live private '+count+'-player table, ready, pause and reconnect',async()=>{
   const prefix='Smoke'+crypto.randomBytes(3).toString('hex');
   const seats=[],players=[];
   const first=await connect();players.push(first);
   const firstSeat=wait(first,'seat-assigned');
   first.emit('create-room',{name:prefix+'1',mode:'individual',target:6,playerCount:count});
   seats.push(await firstSeat);
   const code=seats[0].code;
   for(let i=1;i<count;i++){
    const guest=await connect();players.push(guest);
    const assigned=wait(guest,'seat-assigned');
    guest.emit('join-room',{name:prefix+(i+1),code});
    seats.push(await assigned);
   }
   const playing=wait(first,'private-state',state=>state.phase==='playing');
   for(const p of players)p.emit('toggle-ready');
   const state=await playing;
   assert.equal(state.playerCount,count);
   assert.equal(state.mode,'individual');
   assert.equal(state.handCounts.length,count);
   assert.equal(state.board[0].a,6);
   assert.equal(state.board[0].b,6);
   const paused=wait(first,'private-state',s=>s.phase==='paused');
   players[1].disconnect();
   const pausedState=await paused;
   assert.equal(pausedState.phase,'paused');
   const replacement=await connect();
   const ack=wait(replacement,'reconnect-ok');
   const resumed=wait(first,'private-state',s=>s.phase==='playing');
   replacement.emit('reconnect-player',{roomCode:code,token:seats[1].token});
   assert.equal((await ack).seat,1);
   const again=await resumed;
   assert.deepEqual(again.board,pausedState.board);
   assert.equal(again.handNo,pausedState.handNo);
   for(const p of players)p.disconnect();
   replacement.disconnect();
  });
 }
 console.log('LIVE SMOKE TEST RESULTS');
 console.log(JSON.stringify(report,null,2));
 if(report.some(r=>r.result==='FAIL'))process.exitCode=1;
}
main().catch(error=>{console.error('smoke harness failed:',error);process.exitCode=1})
 .finally(()=>{for(const s of sockets)s.disconnect()});
