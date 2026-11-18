'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');
const {io}=require('socket.io-client');

test('assigned tournament accounts join dedicated online rooms while outsiders are rejected',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'domino-tmatch-'));
 const secret='t'.repeat(48);
 const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
   env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
     DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(directory,'wallet.sqlite'),
     DOMINO_TOURNAMENT_ADMIN_TOKEN:secret},
   stdio:['ignore','ignore','pipe','ipc']
 });
 const sockets=[];
 t.after(()=>{for(const s of sockets)s.disconnect();child.kill();fs.rmSync(directory,{recursive:true,force:true});});
 const port=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('start timeout')),10000);
   child.once('message',m=>{clearTimeout(timer);resolve(m.port)});
   child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code))});
 });
 const url='http://127.0.0.1:'+port;
 async function api(route,body,admin=false){
   const r=await fetch(url+'/api/domino/wallet/'+route,{method:'POST',headers:{
     'content-type':'application/json',...(admin?{authorization:'Bearer '+secret}:{})
   },body:JSON.stringify(body)});
   return {status:r.status,body:await r.json()};
 }
 function event(socket,name,predicate=()=>true) {
   return new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('Timed out '+name)),5000);
     function on(value){if(!predicate(value))return;clearTimeout(timer);socket.off(name,on);resolve(value)}
     socket.on(name,on);
   });
 }
 async function connect(){
   const s=io(url,{transports:['websocket'],forceNew:true,reconnection:false});
   sockets.push(s);await event(s,'connect');return s;
 }
 const a=(await api('register',{name:'BracketOne'})).body;
 const b=(await api('register',{name:'BracketTwo'})).body;
 const outsider=(await api('register',{name:'BracketOther'})).body;
 await api('tournaments',{id:'fixture1',capacity:2},true);
 await api('tournaments/fixture1/join',{id:a.account.id,token:a.token});
 await api('tournaments/fixture1/join',{id:b.account.id,token:b.token});
 assert.equal((await api('tournaments/fixture1/start',{},true)).body.matches.length,1);
 const rejected=await connect();
 let failure=event(rejected,'room-error');
 rejected.emit('join-tournament-match',{tournamentId:'fixture1',round:1,slot:1,
   accountId:outsider.account.id,accountToken:outsider.token});
 assert.match(await failure,/not assigned/);
 const first=await connect();
 const firstSeat=event(first,'seat-assigned');
 first.emit('join-tournament-match',{tournamentId:'fixture1',round:1,slot:1,
   accountId:a.account.id,accountToken:a.token});
 const seat=await firstSeat;
 assert.equal(seat.seat,0);
 const second=await connect();
 const playing=event(first,'private-state',s=>s.phase==='playing');
 const secondSeat=event(second,'seat-assigned');
 second.emit('join-tournament-match',{tournamentId:'fixture1',round:1,slot:1,
   accountId:b.account.id,accountToken:b.token});
 const otherSeat=await secondSeat;
 assert.equal(otherSeat.code,seat.code);
 const board=await playing;
 assert.equal(board.phase,'playing');
 assert.equal(board.board[0].a,6);
 assert.equal(board.board[0].b,6);
 const paused=event(first,'private-state');
 second.disconnect();
 const snapshot=await paused;
 assert.equal(snapshot.phase,'paused');
 const third=await connect(),resumed=event(first,'private-state');
 const ack=event(third,'reconnect-ok');
 third.emit('reconnect-player',{roomCode:seat.code,token:otherSeat.token});
 assert.equal((await ack).seat,otherSeat.seat);
 const restored=await resumed;
 assert.equal(restored.phase,'playing');
 assert.deepEqual(restored.board,snapshot.board);
 assert.equal(restored.handNo,snapshot.handNo);
 failure=event(rejected,'room-error');
 rejected.emit('join-room',{name:'Other',code:seat.code});
 assert.match(await failure,/tournament or public join/);
 failure=event(rejected,'room-error');
 rejected.emit('join-tournament-match',{tournamentId:'fixture1',round:1,slot:1,
   accountId:outsider.account.id,accountToken:outsider.token});
 assert.match(await failure,/not assigned/);
 assert.equal((await api('me',{id:a.account.id,token:a.token})).body.balance,75);
 assert.equal((await api('me',{id:b.account.id,token:b.token})).body.balance,75);
});
