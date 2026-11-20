'use strict';
// Isolated, development-only, paid-tournament end-to-end test.
// Uses temporary SQLite database and a forked local server, not public rooms.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');
const {io}=require('socket.io-client');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

for (const count of [3,4]) test(count+'-player Cut Throat tournament match ends at six and settles bracket', {timeout:240000}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'domino-tournament-'+count+'-'));
 const secret='f'.repeat(48);
 const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
  env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',DOMINO_CREDIT_STORAGE:'sqlite',
   DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),DOMINO_TOURNAMENT_ADMIN_TOKEN:secret},
  stdio:['ignore','ignore','pipe','ipc']
 });
 const clients=[];
 t.after(()=>{clients.forEach(s=>s.disconnect());child.kill();fs.rmSync(dir,{recursive:true,force:true})});
 const port=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('server startup timeout')),10000);
  child.once('message',msg=>{clearTimeout(timer);resolve(msg.port)});
  child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code))});
 });
 const base='http://127.0.0.1:'+port;
 async function api(route,body={},admin=false,method='POST'){
  const response=await fetch(base+'/api/domino/wallet/'+route,{
   method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+secret}:{})},
   ...(method==='GET'?{}:{body:JSON.stringify(body)})
  });
  const data=await response.json();
  assert.equal(response.status,200,route+': '+JSON.stringify(data));
  return data;
 }
 function event(socket,name,pred=()=>true){
  return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{socket.off(name,on);reject(Error('timeout '+name))},10000);
   function on(value){if(!pred(value))return;clearTimeout(timeout);socket.off(name,on);resolve(value)}
   socket.on(name,on);
  });
 }
 async function connect(){
  const socket=io(base,{transports:['websocket'],forceNew:true,reconnection:false});
  clients.push(socket);await event(socket,'connect');return socket;
 }
 const accounts=[];
 for(let i=0;i<count;i++) accounts.push(await api('register',{name:'Fixture'+count+'Player'+i}));
 const tournamentId='finals_'+count+'_e2e';
 await api('tournaments',{id:tournamentId,capacity:count,playerCount:count},true);
 for(const a of accounts)await api('tournaments/'+tournamentId+'/join',{id:a.account.id,token:a.token});
 const started=await api('tournaments/'+tournamentId+'/start',{},true);
 assert.equal(started.matches.length,1);
 assert.equal(started.matches[0].playerIds.length,count);
 const sockets=[],states=Array(count).fill(null),errors=Array.from({length:count},()=>[]);
 for(let i=0;i<count;i++){
  const s=await connect();sockets.push(s);
  s.on('private-state',state=>states[i]=state);
  s.on('action-error',message=>errors[i].push(String(message)));
  const assigned=event(s,'seat-assigned');
  s.emit('join-tournament-match',{tournamentId,round:1,slot:1,
   accountId:accounts[i].account.id,accountToken:accounts[i].token});
  await assigned;
 }
 const ends=board=>!board.length?[null,null]:[board[0].a,board[board.length-1].b];
 const signature=s=>[s.phase,s.handNo,s.board.length,s.turn,s.scores.join(','),s.lastEvent].join(':');
 const start=Date.now();let last='',moves=0,completed=null;
 while(Date.now()-start<205000){
  const current=states[0];
  if(!current){await delay(40);continue}
  if(current.phase==='match-over'){completed=current;break}
  if(current.phase==='choose-poser'){
   const chosen=current.poseOptions?.[0];
   if(Number.isInteger(chosen)&&last!=='pose:'+current.handNo){
    sockets[chosen].emit('choose-poser',{seat:chosen});last='pose:'+current.handNo;
   }
   await delay(50);continue;
  }
  if(current.phase!=='playing'){await delay(80);continue}
  if(Date.now()<(current.dealUntil||0)+50){await delay(70);continue}
  const seat=current.turn,my=states[seat];
  if(!Number.isInteger(seat)||!my||signature(my)!==signature(current)||
     my.hand.length!==current.handCounts?.[seat]){await delay(35);continue}
  const sig=signature(current);
  if(last===sig){await delay(45);continue}
  const [left,right]=ends(current.board);
  const tile=my.hand.find(d=>!current.board.length||d.a===left||d.b===left||d.a===right||d.b===right);
  if(!tile){last=sig;await delay(90);continue}
  const side=tile.a===left||tile.b===left?'left':'right';
  const oldErrors=errors[seat].length;
  sockets[seat].emit('play-domino',{tileId:tile.id,side});last=sig;moves++;
  for(let tries=0;tries<100;tries++){
   await delay(70);
   if(signature(states[0])!==sig)break;
   if(errors[seat].length!==oldErrors){
    await delay(250);
    if(signature(states[0])===sig)assert.fail('Rejected stable tournament move: '+errors[seat].slice(oldErrors));
    last='';break;
   }
   if(tries===99)assert.fail('No acknowledgement for tournament move '+moves);
  }
 }
 assert.ok(completed,'Tournament match did not finish in time; moves='+moves+' state='+JSON.stringify(states[0]&&{phase:states[0].phase,scores:states[0].scores}));
 const winnerSeat=completed.scores.findIndex(n=>n===6);
 assert.equal(completed.playerCount,count);
 assert.ok(winnerSeat>=0,'Winner must reach exactly six');
 const bracket=await api('tournaments/'+tournamentId,{},false,'GET');
 assert.equal(bracket.status,'completed');
 assert.equal(bracket.matches[0].status,'completed');
 assert.equal(bracket.matches[0].winnerId,accounts[winnerSeat].account.id);
 for(const a of accounts)assert.equal((await api('me',{id:a.account.id,token:a.token})).balance,75);
});
