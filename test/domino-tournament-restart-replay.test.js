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
 const firstSeat=await join(first,a);
 const second=await connect(base);
 const playing=event(first,'private-state');
 const secondSeat=await join(second,b);
 assert.equal(firstSeat.code,secondSeat.code);
 assert.equal((await playing).phase,'playing');
 const pending=(await req(base,'tournaments/mine',{id:a.account.id,token:a.token})).data;
 assert.equal(pending.find(e=>e.id==='replay').matches[0].attempts,1);
 const dead=child;
 await new Promise(resolve=>{dead.once('exit',resolve);dead.kill('SIGKILL')});
 base=await launch();
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
