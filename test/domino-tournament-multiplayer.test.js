'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');
const {io}=require('socket.io-client');

test('tournament fixtures seat all registered players in 3- and 4-player online matches',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'domino-multi-tournament-'));
 const secret='x'.repeat(48);
 const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
   env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
     DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),
     DOMINO_TOURNAMENT_ADMIN_TOKEN:secret},
   stdio:['ignore','ignore','pipe','ipc']
 });
 const clients=[];
 t.after(()=>{clients.forEach(c=>c.disconnect());child.kill();fs.rmSync(dir,{recursive:true,force:true})});
 const port=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('server timeout')),10000);
   child.once('message',m=>{clearTimeout(timeout);resolve(m.port)});
   child.once('exit',code=>{clearTimeout(timeout);reject(Error('server exit '+code))});
 });
 const base='http://127.0.0.1:'+port;
 async function api(route,body,admin=false) {
   const response=await fetch(base+'/api/domino/wallet/'+route,{
     method:'POST',headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+secret}:{})},
     body:JSON.stringify(body)
   });
   return {status:response.status,body:await response.json()};
 }
 function event(s,name,accept=()=>true){
   return new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{s.off(name,on);reject(Error('timeout '+name))},9000);
     function on(value){if(!accept(value))return;clearTimeout(timer);s.off(name,on);resolve(value)}
     s.on(name,on);
   });
 }
 async function connect(){
   const s=io(base,{transports:['websocket'],forceNew:true,reconnection:false});
   clients.push(s);await event(s,'connect');return s;
 }
 for(const count of [3,4]) {
   const id='m'+count;
   const players=[];
   for(let i=0;i<count;i++){
     const response=await api('register',{name:'Multi'+count+'_'+i});
     assert.equal(response.status,200);
     players.push(response.body);
   }
   assert.equal((await api('tournaments',{id,capacity:count,playerCount:count},true)).status,200);
   for(const p of players)assert.equal((await api('tournaments/'+id+'/join',{id:p.account.id,token:p.token})).status,200);
   const bracket=await api('tournaments/'+id+'/start',{},true);
   assert.equal(bracket.body.playerCount,count);
   assert.equal(bracket.body.matches[0].playerIds.length,count);
   const seats=[];
   let playing;
   for(let i=0;i<count;i++){
     const socket=await connect();
     const assigned=event(socket,'seat-assigned');
     if(i===count-1)playing=event(seats[0].socket,'private-state',s=>s.phase==='playing');
     socket.emit('join-tournament-match',{tournamentId:id,round:1,slot:1,
       accountId:players[i].account.id,accountToken:players[i].token});
     const seat=await assigned;
     if(seats.length)assert.equal(seat.code,seats[0].seat.code);
     seats.push({socket,seat});
   }
   const state=await playing;
   assert.equal(state.playerCount,count);
   assert.equal(state.handCounts.length,count);
   assert.equal(state.mode,'individual');
   assert.equal(state.handNo,1);
   const spectator=await connect(),error=event(spectator,'room-error');
   spectator.emit('join-tournament-match',{tournamentId:id,round:1,slot:1,
     accountId:players[0].account.id,accountToken:players[0].token});
   assert.match(await error,/existing tournament seat/);
   seats.forEach(({socket})=>socket.disconnect());
 }
});
