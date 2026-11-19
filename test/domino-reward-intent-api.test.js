'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

test('reward intent is authenticated, read-only until verified SSV and isolated between accounts',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'domino-reward-'));
  const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
    env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
      DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),
      DOMINO_REWARDED_ADS_ENABLED:'true'},
    stdio:['ignore','ignore','pipe','ipc']
  });
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Reward test server did not start')),10000);
    child.once('message',m=>{clearTimeout(timer);resolve(m.port)});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Reward server exited '+code))});
  });
  const base='http://127.0.0.1:'+port+'/api/domino/wallet/';
  async function post(route,body){
    const response=await fetch(base+route,{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const text=await response.text();
    return {status:response.status,body:JSON.parse(text)};
  }
  const owner=(await post('register',{name:'ClaimOwner'})).body;
  const other=(await post('register',{name:'ClaimOther'})).body;
  const claim=await post('rewards/intent',{id:owner.account.id,token:owner.token});
  assert.equal(claim.status,200);
  assert.match(claim.body.nonce,/^[0-9a-f]{48}$/);
  assert.equal(claim.body.accountId,owner.account.id);
  const mine=await post('rewards/status',{id:owner.account.id,token:owner.token,nonce:claim.body.nonce});
  assert.deepEqual(mine,{status:200,body:{status:'pending',credits:0}});
  assert.equal((await post('rewards/status',{id:other.account.id,token:other.token,nonce:claim.body.nonce})).status,400);
  assert.equal((await post('rewards/status',{id:owner.account.id,token:other.token,nonce:claim.body.nonce})).status,400);
  assert.equal((await post('rewards/intent',{id:owner.account.id,token:other.token})).status,400);
  // Neither an ad-completion claim nor a forged callback can reach a reward setter.
  const fake=await fetch(base+'rewards/settle',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({nonce:claim.body.nonce,eventId:'fake-client',token:owner.token})});
  assert.equal(fake.status,404);
  assert.equal((await post('me',{id:owner.account.id,token:owner.token})).body.balance,100);
  assert.equal((await post('me',{id:other.account.id,token:other.token})).body.balance,100);
});
