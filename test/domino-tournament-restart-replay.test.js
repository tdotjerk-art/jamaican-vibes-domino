'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');
const {io}=require('socket.io-client');

// This kills the real Node server midway through an online tournament match.
// The bracket survives, the board intentionally does not, and the fresh
// replay attempt must not deduct another tournament entry fee.
test('interrupted tournament match safely replays after server crash without another debit',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'domino-tournament-replay-'));
 const database=path.join(dir,'wallet.sqlite');
 const token='r'.repeat(48);
 let child=null;
 const sockets=[];
 t.after(()=>{for(const s of sockets)s.disconnect();child?.kill();fs.rmSync(dir,{recursive:true,force:true})});
 async function launch(){
   const next=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
     env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
       DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:database,
       DOMINO_TOURNAMENT_ADMIN_TOKEN:token},
     stdio:['ignore','ignore','pipe','ipc']
   });
   child=next;
   return await new Promise((resolve,reject)=>{
     const tm=setTimeout(()=>reject(Error('server startup timed out')),10000);
     next.once('message',msg=>{clearTimeout(tm);resolve('http://127.0.0.1:'+msg.port)});
     next.once('exit',code=>{clearTimeout(tm);reject(Error('server exit '+code))});
   });
 }
 async function req(base,route,body,admin=false) {
   const response=await fetch(base+'/api/domino/wallet/'+route,{
     method:'POST',headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+token}:{})},
     body:JSON.stringify(body)
   });
   return {status:response.status,data:await response.json()};
 }
 const event=(socket,name)=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('timeout waiting for '+name)),7000);
   socket.once(name,data=>{clearTimeout(timeout);resolve(data)});
 });
 async function connect(base){
   const socket=io(base,{transports:['websocket'],forceNew:true,reconnection:false});
   sockets.push(socket);await event(socket,'connect');return socket;
 }
 async function join(socket,account){
   const seated=event(socket,'seat-assigned');
   socket.emit('join-tournament-match',{tournamentId:'replay',round:1,slot:1,
     accountId:account.account.id,accountToken:account.token});
   return seated;
 }
 let base=await launch();
 const a=(await req(base,'register',{name:'ReplayOne'})).data;
 const b=(await req(base,'register',{name:'ReplayTwo'})).data;
 assert.equal((await req(base,'tournaments',{id:'replay',capacity:2},true)).status,200);
 assert.equal((await req(base,'tournaments/replay/join',{id:a.account.id,token:a.token})).data.balance,75);
 assert.equal((await req(base,'tournaments/replay/join',{id:b.account.id,token:b.token})).data.balance,75);
 assert.equal((await req(base,'tournaments/replay/start',{},true)).status,200);
 const first=await connect(base);
 const state=[null,null],errors=[];
 first.on('private-state',v=>{state[0]=v});
 first.on('action-error',e=>errors.push(String(e)));
 const firstSeat=await join(first,a);
 const second=await connect(base);
 second.on('private-state',v=>{state[1]=v});
 second.on('action-error',e=>errors.push(String(e)));
 const playing=event(first,'private-state');
 const secondSeat=await join(second,b);
 assert.equal(firstSeat.code,secondSeat.code);
 const dealt=await playing;
 assert.equal(dealt.phase,'playing');
 // Make one REAL legal move before crashing; this verifies the interrupted
 // state was an active board rather than a still-empty pregame fixture.
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,dealt.dealUntil-Date.now())+120));
 const active=state[0];
 assert.equal(active.phase,'playing');
 const seat=active.turn;
 const current=state[seat];
 assert.ok(current&&Array.isArray(current.hand)&&current.hand.length>0);
 const left=active.board[0].a,right=active.board[active.board.length-1].b;
 const domino=current.hand.find(d=>d.a===left||d.b===left||d.a===right||d.b===right);
 assert.ok(domino,'A playable opening domino should exist');
 const updated=event(first,'private-state',v=>v.board.length>active.board.length);
 [first,second][seat].emit('play-domino',{tileId:domino.id,
  side:domino.a===left||domino.b===left?'left':'right'});
 const played=await updated;
 assert.ok(played.board.length>=2,'At least one move must be on the board before the crash');
 assert.deepEqual(errors,[],'A legal opening move cannot be rejected');
 const pending=(await req(base,'tournaments/mine',{id:a.account.id,token:a.token})).data;
 assert.equal(pending.find(e=>e.id==='replay').matches[0].attempts,1);
 const dead=child;
 await new Promise(resolve=>{dead.once('exit',resolve);dead.kill('SIGKILL')});
 base=await launch();
 // The old room and reconnect tokens MUST NOT resurrect the old board.
 const stale=await connect(base);
 const staleError=event(stale,'room-error');
 stale.emit('reconnect-player',{roomCode:firstSeat.code,token:firstSeat.token});
 assert.match(await staleError,/Room no longer exists/i);
 const reopened=(await req(base,'tournaments/mine',{id:a.account.id,token:a.token})).data;
 assert.equal(reopened.find(e=>e.id==='replay').matches[0].status,'pending');
 assert.equal(reopened.find(e=>e.id==='replay').matches[0].attempts,1);
 assert.equal((await req(base,'me',{id:a.account.id,token:a.token})).data.balance,75);
 assert.equal((await req(base,'me',{id:b.account.id,token:b.token})).data.balance,75);
 const newFirst=await connect(base);
 const newFirstSeat=await join(newFirst,a);
 const newSecond=await connect(base);
 const restartPlaying=event(newFirst,'private-state');
 const newSecondSeat=await join(newSecond,b);
 assert.equal(newFirstSeat.code,newSecondSeat.code);
 const restartedState=await restartPlaying;
 assert.ok(['playing','hand-over'].includes(restartedState.phase), 'Replay should start fresh gameplay');
 assert.ok(restartedState.handNo>=1, 'Replay must deal at least one new hand');
 assert.equal((await req(base,'tournaments/mine',{id:a.account.id,token:a.token})).data
   .find(e=>e.id==='replay').matches[0].attempts,2);
 assert.equal((await req(base,'me',{id:a.account.id,token:a.token})).data.balance,75);
 assert.equal((await req(base,'me',{id:b.account.id,token:b.token})).data.balance,75);
});
