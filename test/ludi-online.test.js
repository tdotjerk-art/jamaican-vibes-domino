const test=require('node:test'),A=require('node:assert/strict'),express=require('express');
const {createLUDIRouter}=require('../ludi-online');
test('LUDI online rooms validate seats, server dice, revisions, reconnects and unanimous rematches',async()=>{
 let rolled=0;const app=express();app.use('/api/ludi',createLUDIRouter({rollDie:()=>[6,3][rolled++%2]}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const call=async(a,seat)=>{const response=await fetch(origin+'/api/ludi'+(a?'':'?code='+seat.code),{method:a?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(seat?{Authorization:'Bearer '+seat.token}:{})},...(a?{body:JSON.stringify({...a,...(seat?{code:seat.code,version:seat.version}:{})})}:{})});return {status:response.status,data:await response.json()}};
 try{
  A.equal((await call({type:'create',total:2})).status,400);A.equal((await call({type:'create',name:'P',total:5})).status,400);
  for(const total of [2,3,4]){
   const host=(await call({type:'create',name:'Junior',total})).data,seats=[host];
   A.equal((await call({type:'start'},host)).status,400);
   for(let i=1;i<total;i++)seats.push((await call({type:'join',code:host.code,name:'P'+i})).data);
   A.equal((await call({type:'join',code:host.code,name:'Extra'})).status,409);
   A.equal((await call(null,{code:host.code,token:'a'.repeat(64)})).status,403);
   A.equal((await call({type:'start'},seats.at(-1))).status,400);
   Object.assign(host,(await call(null,host)).data);Object.assign(host,(await call({type:'start'},host)).data);A.equal(host.state.players.length,total);
   const rolled=await Promise.all([call({type:'roll',die:1},host),call({type:'roll',die:5},host)]);A.deepEqual(rolled.map(r=>r.status).sort(),[200,409]);
   Object.assign(host,(await call(null,host)).data);A.deepEqual(host.state.dice,[6,3]);A.deepEqual(host.state.remaining,[0,1]);A.equal(host.state.phase,'move');
   Object.assign(seats[1],(await call(null,seats[1])).data);A.equal((await call({type:'move',piece:0},seats[1])).status,400);
   Object.assign(host,(await call({type:'move',piece:0,die:0},host)).data);A.equal(host.state.players[0].tokens[0],0);A.deepEqual(host.state.remaining,[1]);A.equal((await call({type:'move',piece:0,die:0},host)).status,400);
   Object.assign(host,(await call({type:'move',piece:0,die:1},host)).data);Object.assign(host,(await call({type:'roll'},host)).data);
   const lowerFirst=await call({type:'move',piece:0,die:1},host);A.equal(lowerFirst.status,200);Object.assign(host,lowerFirst.data);A.equal(host.state.players[0].tokens[0],6);
   Object.assign(host,(await call({type:'move',piece:0,die:0},host)).data);Object.assign(host,(await call({type:'roll'},host)).data);
   for(let round=3;round<=4;round++){A.equal(host.state.turn,0);A.equal(host.state.phase,'move');A.deepEqual(host.state.remaining,[0,1]);Object.assign(host,(await call({type:'move',piece:0,die:0},host)).data);Object.assign(host,(await call({type:'move',piece:0,die:1},host)).data);A.equal(host.state.turn,0);A.equal(host.state.phase,'roll');if(round<4)Object.assign(host,(await call({type:'roll'},host)).data);}
   const recovered=(await call(null,host)).data;A.equal(recovered.you,0);A.equal(recovered.state.players[0].name,'Junior');A.equal(recovered.token,undefined);
   for(let i=0;i<total;i++){Object.assign(seats[i],(await call(null,seats[i])).data);const r=await call({type:'rematch'},seats[i]);A.equal(r.status,200);if(i<total-1)A.equal(r.data.state.players[0].tokens[0],30);else{A.deepEqual(r.data.state.players[0].tokens,[-1,-1,-1,-1]);A.deepEqual(r.data.votes,[]);}}
  }
  const foreign=await fetch(origin+'/api/ludi',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify({type:'create',name:'P',total:2})});A.equal(foreign.status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('the existing app serves LUDI, its assets and the home-menu link',async()=>{
 const {server,io}=require('../server');await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const home=await(await fetch(origin+'/')).text();A.match(home,/href="\/ludi\/"[^>]*>LUDI/);
  for(const route of ['/ludi/','/ludi/engine.js','/ludi/layout.js','/ludi/app.js','/ludi/style.css'])A.equal((await fetch(origin+route)).status,200);
  const page=await(await fetch(origin+'/ludi/')).text();for(const text of ['How to play','Roll dice','LUDI'])A.ok(page.includes(text));
  const result=await fetch(origin+'/api/ludi',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'create',name:'Junior',total:2})});A.equal(result.status,200);
 }finally{server.closeAllConnections();await new Promise(r=>io.close(r))}
});

test('online red capture cannot bypass the other die and a valid second piece must still move',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),E=require('../public/ludi/engine');
 const {createLudiStorage}=require('../ludi-storage');
 for(const otherProgress of [E.HOME-1,20]){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-red-capture-'));
  const g=E.fresh(['Green','Red','Black','Gold']);g.turn=1;g.phase='move';g.dice=[2,3];g.remaining=[0,1];g.rollNo=1;g.players[1].tokens=[0,otherProgress,E.HOME,E.HOME];g.players[2].tokens[0]=38;
  const tokens=g.players.map((_,i)=>String(i+1).repeat(64));
  createLudiStorage(directory).save({code:'ABCDEF12',total:4,seats:g.players.map((p,i)=>({name:p.name,key:crypto.createHash('sha256').update(tokens[i]).digest('hex')})),game:g,version:7,votes:[],expires:Date.now()+60000,deadline:Date.now()+10000});
  const router=createLUDIRouter({storageDir:directory}),app=express();app.use('/api/ludi',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
  let version=7;
  async function call(action){const res=await fetch(origin+'/api/ludi'+(action?'':'?code=ABCDEF12'),{method:action?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+tokens[1]},...(action?{body:JSON.stringify({...action,code:'ABCDEF12',version})}:{})});const data=await res.json();if(res.ok)version=data.version;return {status:res.status,data}}
  try{
   if(otherProgress===E.HOME-1){
    const rejected=await call({type:'move',piece:0,die:0});A.equal(rejected.status,400);A.match(rejected.data.error,/Use both dice/);A.equal(version,7);
    A.deepEqual((await call()).data.state,g,'rejected capture must not change the saved board');
    A.equal((await call({type:'move',piece:0,die:1})).status,200);const finished=await call({type:'move',piece:0,die:0});A.equal(finished.status,200);A.equal(finished.data.state.players[1].tokens[0],5);A.equal(finished.data.state.turn,2);
   }else{
    const captured=await call({type:'move',piece:0,die:0});A.equal(captured.status,200);A.equal(captured.data.state.last.captured.length,1);A.equal(captured.data.state.turn,1);A.deepEqual(captured.data.state.remaining,[1]);
    A.equal((await call({type:'roll'})).status,400);A.equal((await call({type:'move',piece:0,die:1})).status,400);
    const second=await call({type:'move',piece:1,die:1});A.equal(second.status,200);A.equal(second.data.state.players[1].tokens[1],23);A.equal(second.data.state.turn,2);
   }
  }finally{router.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true})}
 }
});
