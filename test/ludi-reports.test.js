'use strict';
const test=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),express=require('express');
const E=require('../public/ludi/engine'),R=require('../public/ludi/report'),{createReports}=require('../ludi-reports'),{createLUDIRouter}=require('../ludi-online');
function report(){const state=E.fresh(['Junior','Andre']);return {build:R.VERSION,capturedAt:Date.now(),mode:'local',revision:null,state,trace:[{at:Date.now(),state}],description:'Red captured and skipped a die.',device:{width:390,height:844,userAgent:'Test browser'}}}

test('move explanations identify entry, overshoot, barriers, capture locks, used dice and two-die obligations without changing the board',()=>{
 let g=E.fresh(['P0','P1','P2','P3']);A.match(E.explainMove(g,0,0,0),/Roll both/);
 g.phase='move';g.dice=[3,2];g.remaining=[0,1];A.match(E.explainMove(g,0,0,0),/six/);
 g.players[0].tokens=[51,52,-1,-1];A.match(E.explainMove(g,0,0,0),/exact roll/);A.match(E.explainMove(g,0,1,0),/already home/);
 g.players[0].tokens=[0,20,52,52];g.players[1].tokens=[37,37,-1,-1];A.match(E.explainMove(g,0,0,0),/barrier/);
 g.players[1].tokens.fill(-1);g.capturedThisRoll=[0];A.match(E.explainMove(g,0,0,0),/already captured/);
 g.capturedThisRoll=[];g.remaining=[1];A.match(E.explainMove(g,0,0,0),/already been used/);
 g.remaining=[0,1];g.players[0].tokens=[0,51,52,52];g.players[1].tokens=[38,-1,-1,-1];const before=JSON.stringify(g);A.match(E.explainMove(g,0,0,1),/Use both dice/);A.equal(E.explainMove(g,0,0,0),'');A.equal(JSON.stringify(g),before);
});

test('report sanitization retains reproducible states and drops credentials and arbitrary properties',()=>{
 const input=report();input.token='SECRET_SEAT_TOKEN';input.profile={token:'SECRET_PROFILE_TOKEN'};input.server={key:'SECRET_SERVER_KEY'};input.state.token='SECRET_STATE_TOKEN';input.state.players[0].recoveryCode='SECRET_RECOVERY';input.trace[0].token='SECRET_TRACE_TOKEN';input.description='x'.repeat(1500);
 const clean=R.clean(input);A.equal(clean.description.length,1000);A.equal(clean.state.players[0].name,'Junior');A.equal(clean.trace.length,1);A.ok(!JSON.stringify(clean).includes('SECRET'));A.throws(()=>R.clean({capturedAt:Date.now()}),/board/);
 input.state.players[0].tokens[0]=99;A.equal(R.clean(input).state.players[0].tokens[0],99,'an out-of-range game position must still be reportable');
});

test('reports are private, atomic, persistent and deduplicated across restarts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-reports-'));try{
  const payload=report(),first=createReports(dir).save(payload);A.match(first.id,/^[a-f0-9]{24}$/);const file=path.join(dir,'reports',first.id+'.json');A.equal(fs.statSync(file).mode&0o777,0o600);
  A.deepEqual(createReports(dir).save(payload),first);A.equal(fs.readdirSync(path.join(dir,'reports')).length,1);A.equal(JSON.parse(fs.readFileSync(file)).report.state.turn,0);
  fs.writeFileSync(file,'{broken');A.throws(()=>createReports(dir).save(payload));A.equal(fs.readFileSync(file,'utf8'),'{broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('online report includes separate frozen-client and authorized server boards without seat secrets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-report-api-')),app=express(),router=createLUDIRouter({storageDir:dir,rollDie:()=>6});app.use('/api/ludi',router);const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const origin='http://127.0.0.1:'+s.address().port;
 async function post(route,body,token){const res=await fetch(origin+'/api/ludi'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:res.status,data:await res.json()}}
 try{
  const host=(await post('',{type:'create',name:'Junior',total:2})).data;await post('',{type:'join',name:'Andre',code:host.code});const started=(await post('',{type:'start',code:host.code,version:1},host.token)).data;
  const payload={...report(),mode:'private',roomCode:host.code,revision:started.version,state:started.state,trace:Array.from({length:8},()=>({at:Date.now(),state:{...started.state,history:Array(40).fill('A recent move with dice and a board position.')}})),token:'SECRET_CLIENT_EXTRA'};
  A.ok(JSON.stringify(payload).length>4096);
  const rolled=(await post('',{type:'roll',code:host.code,version:started.version},host.token)).data;
  const receipt=await post('/reports',payload,host.token);A.equal(receipt.status,200);const saved=JSON.parse(fs.readFileSync(path.join(dir,'reports',receipt.data.id+'.json')));
  A.equal(saved.report.state.rollNo,0);A.equal(saved.server.state.rollNo,1);A.equal(saved.server.revision,rolled.version);A.ok(!JSON.stringify(saved).includes(host.token));A.ok(!JSON.stringify(saved).includes('SECRET_CLIENT_EXTRA'));A.ok(!JSON.stringify(saved).includes('"key"'));
  A.equal((await post('/reports',payload,host.token)).data.id,receipt.data.id);
  const unauth=await post('/reports',{...payload,description:'No seat credentials'});A.equal(unauth.status,200);A.equal(JSON.parse(fs.readFileSync(path.join(dir,'reports',unauth.data.id+'.json'))).server,null);
  A.equal((await fetch(origin+'/api/ludi/reports/'+receipt.data.id)).status,404,'report bodies must not be publicly readable');
  A.equal((await post('/reports',{capturedAt:Date.now()})).status,400);
  A.equal((await post('/reports',{...payload,description:'x'.repeat(100000)})).status,413);
  A.equal((await post('',{type:'create',name:'Test',total:2,extra:'x'.repeat(5000)})).status,413,'ordinary game actions retain the smaller body limit');
  const foreign=await fetch(origin+'/api/ludi/reports',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify(payload)});A.equal(foreign.status,403);
 }finally{router.close();s.closeAllConnections();await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});

test('a report write failure never returns a saved receipt',async t=>{
 t.mock.method(console,'error',()=>{});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ludi-report-failure-')),router=createLUDIRouter({storageDir:dir}),app=express();app.use('/api/ludi',router);fs.rmdirSync(path.join(dir,'reports'));fs.writeFileSync(path.join(dir,'reports'),'blocked');const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const origin='http://127.0.0.1:'+s.address().port;
 try{const res=await fetch(origin+'/api/ludi/reports',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(report())});A.equal(res.status,503);const data=await res.json();A.equal(data.id,undefined);A.match(data.error,/Download/)}finally{router.close();s.closeAllConnections();await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});
