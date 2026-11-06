'use strict';
const test=require('node:test'),A=require('node:assert/strict'),express=require('express');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLUDIRouter}=require('../ludi-online'),{createCommunity}=require('../ludi-community');
const {createLudiStorage}=require('../ludi-storage'),E=require('../public/ludi/engine');
async function server(directory){const app=express(),router=createLUDIRouter({storageDir:directory});app.use('/api/ludi',router);const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const origin='http://127.0.0.1:'+s.address().port;
 return {async close(){router.close();s.closeAllConnections();await new Promise(r=>s.close(r))},async call(action,seat,player,route=''){
  const url=origin+'/api/ludi'+route+(!action?(route?'':'?code='+seat.code):'');const r=await fetch(url,{method:action?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(seat?{Authorization:'Bearer '+seat.token}:{}),...(player?{'x-ludi-profile-token':player.token}:{})},...(action?{body:JSON.stringify({...action,...(seat?{code:seat.code,version:seat.version}:{}),...(player?{profileId:player.profile.id}:{})})}:{})});return {status:r.status,data:await r.json()};}}}
async function ok(s,a,seat,player,route){const r=await s.call(a,seat,player,route);A.equal(r.status,200,JSON.stringify(r.data));return r.data}
const profile=(s,name)=>ok(s,{type:'create',name},null,null,'/profile');

test('public tables fill first-come, auto-start at 2–4 players, and stay separate from private rooms',async()=>{
 const s=await server(null);try{
  const players=[];for(let i=0;i<12;i++)players.push(await profile(s,'P'+i));
  const privateRoom=await ok(s,{type:'create',name:'Private',total:4},null,players[11]);
  for(const total of [2,3,4]){
   const seated=[];for(let i=0;i<total;i++)seated.push(await ok(s,{type:'find',name:'P'+i,total},null,players[i]));
   A.ok(seated.every(p=>p.code===seated[0].code));A.notEqual(seated[0].code,privateRoom.code);A.equal(seated.at(-1).state.players.length,total);A.equal(seated.at(-1).publicTable,true);
   // A profile returns to its active public seat, rather than occupying another one.
   const recovered=await ok(s,{type:'find',name:'P0',total},null,players[0]);A.equal(recovered.code,seated[0].code);A.equal(recovered.you,0);
   A.equal((await s.call({type:'join',name:'Invader',code:recovered.code})).status,400);
   for(const seat of seated)seat.token=recovered.you===seat.you?recovered.token:seat.token;
   // Complete this table in the fixture store by creating fresh profiles for the next size.
   for(let i=0;i<total;i++)players[i]=await profile(s,'Next'+total+'-'+i);
  }
  const a=await profile(s,'First'),b=await profile(s,'Second'),c=await profile(s,'Third');
  const first=await ok(s,{type:'find',name:'First',total:2},null,a);const second=await ok(s,{type:'find',name:'Second',total:2},null,b);A.equal(first.code,second.code);
  const third=await ok(s,{type:'find',name:'Third',total:2},null,c);A.notEqual(third.code,first.code);A.equal(third.state,null);
 }finally{await s.close()}
});

test('waiting players can cancel and stale searches do not block public seats',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);const s=await server(null);
 try{
  const a=await profile(s,'First'),b=await profile(s,'Second');let first=await ok(s,{type:'find',name:'First',total:3},null,a);const second=await ok(s,{type:'find',name:'Second',total:3},null,b);
  A.equal((await ok(s,{type:'cancel'},first)).cancelled,true);A.equal((await ok(s,null,second)).you,0);
  now+=46000;const c=await profile(s,'Fresh'),fresh=await ok(s,{type:'find',name:'Fresh',total:3},null,c);A.notEqual(fresh.code,first.code);A.equal(fresh.players.length,1);
  A.equal((await s.call(null,second)).status,404);await ok(s,{type:'cancel'},fresh);A.equal((await s.call(null,fresh)).status,404);
 }finally{await s.close()}
});

test('saved profiles, verified results and leaderboard survive restarts without duplicate credit',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-community-'));let s=await server(directory);
 try{
  const a=await profile(s,'Junior'),b=await profile(s,'Andre');let h=await ok(s,{type:'create',name:'Junior',total:2},null,a);const guest=await ok(s,{type:'join',code:h.code,name:'Andre'},null,b);
  Object.assign(h,await ok(s,null,h));Object.assign(h,await ok(s,{type:'start'},h));await s.close();
  const store=createLudiStorage(directory),r=store.load().find(r=>r.code===h.code);r.game=E.fresh(['Junior','Andre']);r.game.players[0].tokens=[52,52,52,49];r.game.phase='move';r.game.dice=[3,1];r.game.remaining=[0];r.game.rollNo=1;store.save(r);
  s=await server(directory);Object.assign(h,await ok(s,null,h));Object.assign(h,await ok(s,{type:'move',piece:3,die:0},h));A.equal(h.state.phase,'over');
  let own=await ok(s,null,null,a,'/profile?id='+a.profile.id);A.equal(own.profile.wins,1);A.equal(own.profile.games,1);
  const other=await ok(s,null,null,b,'/profile?id='+b.profile.id);A.equal(other.profile.wins,0);A.equal(other.profile.losses,1);
  A.equal((await s.call(null,null,{...a,token:'f'.repeat(64)},'/profile?id='+a.profile.id)).status,403);
  A.equal((await s.call({type:'move',piece:3,die:0},h)).status,400);
  await s.close();s=await server(directory);own=await ok(s,null,null,a,'/profile?id='+a.profile.id);A.equal(own.profile.wins,1);A.equal(own.profile.games,1);
  const board=await ok(s,null,null,null,'/leaderboard');A.equal(board.players[0].name,'Junior');A.equal(board.players[0].wins,1);A.ok(!JSON.stringify(board).includes(a.token));A.ok(!JSON.stringify(board).includes('"key"'));
  Object.assign(h,await ok(s,null,h));Object.assign(h,await ok(s,{type:'rematch'},h));Object.assign(guest,await ok(s,null,guest));await ok(s,{type:'rematch'},guest);
  // Room expiry removes the table but never removes archived player results.
  await s.close();const saved=store.load().find(r=>r.code===h.code);saved.expires=Date.now()-1;store.save(saved);s=await server(directory);
  A.equal((await s.call(null,h)).status,404);A.equal((await ok(s,null,null,a,'/profile?id='+a.profile.id)).profile.games,1);
 }finally{await s.close();fs.rmSync(directory,{recursive:true,force:true})}
});

test('result archives are idempotent, private tokens are hashed, and corrupt profiles fail closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-profile-'));try{
  const c=createCommunity(dir),a=c.create('Junior'),b=c.create('Andre'),result={id:'d'.repeat(32),at:Date.now(),players:[{id:a.profile.id,name:'Junior'},{id:b.profile.id,name:'Andre'}],winner:a.profile.id};
  c.record(result);c.record(result);A.equal(c.profile(a.profile.id,a.token).games,1);A.equal(createCommunity(dir).profile(a.profile.id,a.token).wins,1);
  const file=path.join(dir,'community/profiles',a.profile.id+'.json');A.ok(!fs.readFileSync(file,'utf8').includes(a.token));A.equal(fs.statSync(file).mode&0o777,0o600);
  A.throws(()=>c.authenticate(a.profile.id,b.token),/recovered/);fs.writeFileSync(file,'{bad');A.throws(()=>createCommunity(dir));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('public queues and profile seat recovery survive a router restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-public-restart-'));let s=await server(dir);try{
  const a=await profile(s,'First'),b=await profile(s,'Second');const waiting=await ok(s,{type:'find',name:'First',total:2},null,a);await s.close();s=await server(dir);
  const recovered=await ok(s,{type:'find',name:'First',total:2},null,a);A.equal(recovered.code,waiting.code);A.equal(recovered.players.length,1);A.equal((await s.call(null,waiting)).status,403,'old seat token is rotated during profile recovery');
  const joined=await ok(s,{type:'find',name:'Second',total:2},null,b);A.equal(joined.code,waiting.code);A.equal(joined.state.players.length,2);A.equal((await s.call({type:'cancel'},recovered)).status,409);
 }finally{await s.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('a pending result is recovered before an expired room is removed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-result-recovery-'));let s;
 try{
  const c=createCommunity(dir),a=c.create('Junior'),b=c.create('Andre'),id='e'.repeat(32),at=Date.now();
  const game=E.fresh(['Junior','Andre']);game.players[0].tokens.fill(52);game.phase='over';game.winner=0;
  createLudiStorage(dir).save({code:'ABCDEF12',total:2,seats:[{name:'Junior',key:'a'.repeat(64),profileId:a.profile.id},{name:'Andre',key:'b'.repeat(64),profileId:b.profile.id}],game,version:9,votes:[],deadline:null,expires:at-1000,matchId:id,results:[{id,at,players:[{id:a.profile.id,name:'Junior'},{id:b.profile.id,name:'Andre'}],winner:a.profile.id}]});
  s=await server(dir);A.equal((await ok(s,null,null,a,'/profile?id='+a.profile.id)).profile.wins,1);A.equal(fs.existsSync(path.join(dir,'ABCDEF12.json')),false);
  await s.close();s=await server(dir);A.equal((await ok(s,null,null,a,'/profile?id='+a.profile.id)).profile.games,1);
 }finally{if(s)await s.close();fs.rmSync(dir,{recursive:true,force:true})}
});
