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
