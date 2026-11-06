'use strict';
const test=require('node:test'),A=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process'),{once}=require('node:events');
const {createLudiStorage}=require('../ludi-storage');
const {createLUDIRouter}=require('../ludi-online');
const express=require('express');

async function start(directory){
 const child=fork(path.join(__dirname,'helpers/ludi-server.cjs'),[directory],{stdio:['ignore','ignore','pipe','ipc']});
 let errors='';child.stderr.on('data',b=>errors+=b);
 const info=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('LUDI test server startup timed out: '+errors))},5000);
  child.once('message',message=>{clearTimeout(timeout);resolve(message)});
  child.once('exit',()=>{clearTimeout(timeout);reject(Error('LUDI test server failed: '+errors))});
 });
 const origin='http://127.0.0.1:'+info.port;
 return {restored:info.restored,async stop(){const ended=once(child,'exit');child.kill('SIGKILL');await ended},
  async call(action,seat){
   const response=await fetch(origin+'/api/ludi'+(action?'':'?code='+seat.code),{
    method:action?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(seat?{Authorization:'Bearer '+seat.token}:{})},
    ...(action?{body:JSON.stringify({...action,...(seat?{code:seat.code,version:seat.version}:{})})}:{})});
   return {status:response.status,data:await response.json()};
  }
 };
}
const stable=view=>{const {serverNow,...rest}=view;return rest};
async function ok(server,action,seat){const r=await server.call(action,seat);A.equal(r.status,200,JSON.stringify(r.data));return r.data}
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ludi-persistence-'));

test('SIGKILL restart restores 2–4 player lobbies, partial dice, authenticated seats and rematch votes',async()=>{
 const directory=temporary();let server=await start(directory);
 try{
  const cases=[];
  const lobby=await ok(server,{type:'create',name:'Waiting host',total:4});
  const lobbyGuest=await ok(server,{type:'join',code:lobby.code,name:'Waiting guest'});
  const lobbyBefore=await ok(server,null,lobby);
  for(const total of [2,3,4]){
   const host=await ok(server,{type:'create',name:'Junior',total}),seats=[host];
   for(let i=1;i<total;i++)seats.push(await ok(server,{type:'join',code:host.code,name:'P'+i}));
   Object.assign(host,await ok(server,null,host));Object.assign(host,await ok(server,{type:'start'},host));
   Object.assign(host,await ok(server,{type:'roll'},host));
   Object.assign(host,await ok(server,{type:'move',piece:0,die:0},host));
   Object.assign(host,await ok(server,{type:'rematch'},host));
   A.deepEqual(host.state.remaining,[1]);A.deepEqual(host.votes,[0]);
   cases.push({host,seats,before:structuredClone(host)});
  }
  const snapshots=fs.readdirSync(directory).filter(n=>n.endsWith('.json'));
  A.equal(snapshots.length,4);
  for(const filename of snapshots){
   const text=fs.readFileSync(path.join(directory,filename),'utf8');
   for(const {seats} of cases)for(const seat of seats)A.ok(!text.includes(seat.token),'raw seat tokens must not be stored');
   A.equal(fs.statSync(path.join(directory,filename)).mode&0o777,0o600);
  }
  await server.stop();server=await start(directory);A.equal(server.restored,4);
  A.deepEqual(stable(await ok(server,null,lobby)),stable(lobbyBefore));
  A.equal((await ok(server,null,lobbyGuest)).you,1);
  for(const {host,seats,before}of cases){
   const recovered=await ok(server,null,host);A.deepEqual(recovered.state,before.state);A.equal(recovered.version,before.version);A.deepEqual(recovered.votes,[0]);
   for(let i=0;i<seats.length;i++){const seat=await ok(server,null,seats[i]);A.equal(seat.you,i);A.deepEqual(seat.players,before.players)}
   A.equal((await server.call(null,{...host,token:'f'.repeat(64)})).status,403);
   A.equal((await server.call({type:'move',piece:0,die:0},host)).status,400,'already used die cannot be replayed');
   Object.assign(host,await ok(server,{type:'move',piece:0,die:1},host));A.equal(host.state.players[0].tokens[0],3);
   A.equal((await server.call({type:'roll'},{...host,version:before.version})).status,409);
  }
  // A recovered lobby still accepts the remaining players and starts normally.
  for(const name of ['Third','Fourth'])await ok(server,{type:'join',code:lobby.code,name});
  Object.assign(lobby,await ok(server,null,lobby));A.equal((await ok(server,{type:'start'},lobby)).state.players.length,4);
  await server.stop();server=await start(directory);
  for(const {host}of cases)A.equal((await ok(server,null,host)).state.players[0].tokens[0],3,'continued moves survive another hard restart');
 }finally{await server.stop();fs.rmSync(directory,{recursive:true,force:true})}
});

test('restored automatic turns resume after ten seconds and their moves survive a second restart',async()=>{
 const directory=temporary();let server=await start(directory);
 try{
  const host=await ok(server,{type:'create',name:'Auto host',total:2});await ok(server,{type:'join',code:host.code,name:'Auto guest'});
  Object.assign(host,await ok(server,null,host));Object.assign(host,await ok(server,{type:'start'},host));
  Object.assign(host,await ok(server,{type:'roll'},host));Object.assign(host,await ok(server,{type:'move',piece:0,die:0},host));
  const version=host.version;
  await server.stop();server=await start(directory);
  A.equal((await ok(server,null,host)).version,version,'restart must not catch up missed turns');
  const until=Date.now()+13000;
  do{await new Promise(r=>setTimeout(r,150));Object.assign(host,await ok(server,null,host))}while(host.version===version&&Date.now()<until);
  A.equal(host.version,version+1);A.equal(host.state.players[0].tokens[0],3);A.equal(host.state.phase,'roll');
  await server.stop();server=await start(directory);A.equal((await ok(server,null,host)).state.players[0].tokens[0],3);
 }finally{await server.stop();fs.rmSync(directory,{recursive:true,force:true})}
});

test('a failed save returns 503 without advancing the board or revision',async()=>{
 const directory=temporary(),router=createLUDIRouter({storageDir:directory,rollDie:()=>6});
 const app=express();app.use('/api/ludi',router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 async function call(action,seat){const r=await fetch(origin+'/api/ludi'+(action?'':'?code='+seat.code),{method:action?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(seat?{Authorization:'Bearer '+seat.token}:{})},...(action?{body:JSON.stringify({...action,...(seat?{code:seat.code,version:seat.version}:{})})}:{})});return {status:r.status,data:await r.json()}}
 try{
  let h=(await call({type:'create',name:'Junior',total:2})).data;await call({type:'join',code:h.code,name:'Andre'});
  Object.assign(h,(await call(null,h)).data);Object.assign(h,(await call({type:'start'},h)).data);const before=(await call(null,h)).data;
  const file=path.join(directory,h.code+'.json');fs.renameSync(file,file+'.backup');fs.mkdirSync(file);
  const failed=await call({type:'roll'},h);A.equal(failed.status,503);A.match(failed.data.error,/save/);A.deepEqual(stable((await call(null,h)).data),stable(before));
  fs.rmdirSync(file);fs.renameSync(file+'.backup',file);
  const retry=await call({type:'roll'},h);A.equal(retry.status,200);A.equal(retry.data.version,h.version+1);A.deepEqual(retry.data.state.dice,[6,6]);
 }finally{router.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true})}
});

test('expired rooms are pruned, interrupted writes ignored, and invalid saves fail closed',()=>{
 const directory=temporary(),store=createLudiStorage(directory);
 const room={code:'ABCDEF12',total:2,seats:[{name:'Junior',key:'a'.repeat(64)}],game:null,version:0,votes:[],expires:Date.now()+60000,deadline:null};
 try{
  store.save(room);fs.writeFileSync(path.join(directory,'interrupted.tmp'),'{');A.deepEqual(store.load(),[room]);
  store.save({...room,expires:Date.now()-1});A.deepEqual(store.load(),[]);A.equal(fs.existsSync(path.join(directory,room.code+'.json')),false);
  store.save(room);const file=path.join(directory,room.code+'.json');const valid=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,'{broken');A.throws(()=>createLUDIRouter({storageDir:directory}));A.equal(fs.readFileSync(file,'utf8'),'{broken');
  fs.writeFileSync(file,valid.replace('"schemaVersion":1','"schemaVersion":99'));A.throws(()=>store.load(),/Invalid saved/);
  fs.writeFileSync(file,valid.replace('"total":2','"total":5'));A.throws(()=>store.load(),/Invalid saved/);
  A.throws(()=>createLudiStorage(path.join(__dirname,'../public/saved-rooms')),/outside the public/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
