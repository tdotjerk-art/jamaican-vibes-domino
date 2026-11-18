'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

test('SQLite tournament pilot API requires admin key and persists transactional entry state',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'domino-sqlite-api-'));
  const secret='a'.repeat(48);
  const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
    env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
      DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(directory,'wallet.sqlite'),
      DOMINO_TOURNAMENT_ADMIN_TOKEN:secret},
    stdio:['ignore','ignore','pipe','ipc']
  });
  t.after(()=>{child.kill();fs.rmSync(directory,{recursive:true,force:true});});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);
    child.once('message',msg=>{clearTimeout(timer);resolve(msg.port);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code));});
  });
  const base='http://127.0.0.1:'+port+'/api/domino/wallet/';
  async function request(method,route,body,admin=false){
    const response=await fetch(base+route,{method,headers:{
      ...(body?{'content-type':'application/json'}:{}),
      ...(admin?{authorization:'Bearer '+secret}:{})
    },...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }
  const a=(await request('POST','register',{name:'BracketA'})).body;
  const b=(await request('POST','register',{name:'BracketB'})).body;
  const c=(await request('POST','register',{name:'BracketC'})).body;
  assert.equal((await request('POST','tournaments',{id:'cup1',capacity:2})).status,403);
  assert.equal((await request('POST','tournaments',{id:'cup1',capacity:2},true)).status,200);
  assert.equal((await request('GET','tournaments')).body[0].id,'cup1');
  const joinA=()=>request('POST','tournaments/cup1/join',{id:a.account.id,token:a.token});
  assert.equal((await joinA()).body.balance,75);
  assert.equal((await joinA()).body.applied,false);
  assert.equal((await request('POST','tournaments/cup1/join',{id:b.account.id,token:b.token})).body.balance,75);
  assert.match((await request('POST','tournaments/cup1/join',{id:c.account.id,token:c.token})).body.error,/full/);
  assert.equal((await request('POST','tournaments/cup1/cancel',{},true)).status,200);
  assert.equal((await request('POST','me',{id:a.account.id,token:a.token})).body.balance,100);
  assert.equal((await request('POST','me',{id:b.account.id,token:b.token})).body.balance,100);
  assert.equal((await request('GET','tournaments/cup1')).body.status,'cancelled');
  assert.equal((await request('POST','tournaments/cup1/start',{},true)).status,400);

  // Second bracket: only the administrator can report results.
  assert.equal((await request('POST','tournaments',{id:'cup2',capacity:2},true)).status,200);
  await request('POST','tournaments/cup2/join',{id:a.account.id,token:a.token});
  await request('POST','tournaments/cup2/join',{id:b.account.id,token:b.token});
  const started=await request('POST','tournaments/cup2/start',{},true);
  assert.equal(started.status,200);
  const assigned=await request('POST','tournaments/mine',{id:a.account.id,token:a.token});
  assert.equal(assigned.status,200);
  assert.equal(assigned.body.find(x=>x.id==='cup2').matches[0].status,'pending');
  assert.equal((await request('POST','tournaments/mine',{id:a.account.id,token:'0'.repeat(64)})).status,400);
  assert.equal(started.body.matches.length,1);
  assert.equal((await request('POST','tournaments/cup2/results',{
    round:1,slot:1,winnerId:a.account.id
  })).status,403);
  assert.equal((await request('POST','tournaments/cup2/results',{
    round:1,slot:1,winnerId:c.account.id
  },true)).status,400);
  const finish=await request('POST','tournaments/cup2/results',{
    round:1,slot:1,winnerId:a.account.id
  },true);
  assert.equal(finish.status,200);
  assert.equal(finish.body.status,'completed');
  assert.equal(finish.body.matches[0].winnerId,a.account.id);
  assert.equal((await request('GET','tournaments/cup2')).body.matches[0].status,'completed');
  // Registered multi-player tournament formats are visible to clients.
  assert.equal((await request('POST','tournaments',{id:'cup3',capacity:3,playerCount:3},true)).status,200);
  assert.equal((await request('POST','tournaments',{id:'cup4',capacity:4,playerCount:4},true)).status,200);
  for(const account of [a,b,c]) {
    const entry=await request('POST','tournaments/cup3/join',{id:account.account.id,token:account.token});
    assert.equal(entry.status,200);
  }
  const three=await request('POST','tournaments/cup3/start',{},true);
  assert.equal(three.status,200);
  assert.equal(three.body.playerCount,3);
  assert.deepEqual(three.body.matches[0].playerIds,[a.account.id,b.account.id,c.account.id]);
  assert.equal((await request('POST','tournaments/cup3/results',{round:1,slot:1,winnerId:c.account.id},true)).body.status,'completed');
  assert.equal((await request('GET','tournaments/cup4')).body.playerCount,4);
});
