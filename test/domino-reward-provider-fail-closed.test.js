'use strict';
// No provider-specific authenticated rewarded-web callback is configured.
// These checks must remain true until a separate, verified provider adapter
// with authenticated event provenance and account/nonce correlation exists.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

test('ad consent flags and forged completion cannot credit wallet without verified provider',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jv-reward-closed-'));
  const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
    env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
      DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),
      DOMINO_REWARDED_ADS_ENABLED:'true',DOMINO_REWARDED_ADS_TEST_MODE:'false',
      DOMINO_REWARDED_ADS_PROVIDER:'google-ad-manager',
      DOMINO_REWARDED_ADS_PUBLISHER_APPROVED:'true'},
    stdio:['ignore','ignore','pipe','ipc']
  });
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true})});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Reward test server timed out')),10000);
    child.once('message',msg=>{clearTimeout(timer);resolve(msg.port)});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Reward server exited '+code))});
  });
  const url='http://127.0.0.1:'+port+'/api/domino/wallet/';
  const post=async(route,body)=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const created=await (await post('register',{name:'AdLockedWallet'})).json();
  const id=created.account.id,token=created.token;
  assert.equal((await post('rewards/intent',{id,token})).status,503,
    'A claimed approval flag must not create a redeemable reward intent');
  const spoofed=[
    'rewards/settle',
    'rewards/callback',
    'rewards/google-ssv',
    'rewards/verify'
  ];
  for(const route of spoofed){
    const response=await post(route,{id,token,nonce:'0'.repeat(48),
      eventId:'fake-provider-event',rewardedSlotGranted:true,verified:true});
    assert.equal(response.status,404,'Unexpected browser-accessible reward settlement at '+route);
  }
  const balance=await (await post('me',{id,token})).json();
  assert.equal(balance.balance,100,'Unverified or spoofed ads must award zero credits');
});
