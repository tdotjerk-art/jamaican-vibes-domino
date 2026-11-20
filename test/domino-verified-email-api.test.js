'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');

test('verified wallet signup and lost-code recovery are email-bound and revoke old credentials', {timeout:30000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jv-email-api-'));
  const outbox=path.join(dir,'outbox.jsonl');
  const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
    env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',DOMINO_CREDIT_STORAGE:'sqlite',
      DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),DOMINO_VERIFIED_EMAIL_REQUIRED:'true',
      DOMINO_EMAIL_TEST_OUTBOX:outbox},
    stdio:['ignore','ignore','pipe','ipc']
  });
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true})});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('server startup timeout')),10000);
    child.once('message',m=>{clearTimeout(timer);resolve(m.port)});
    child.once('exit',c=>{clearTimeout(timer);reject(Error('server exited '+c))});
  });
  async function post(route,data){
    const r=await fetch('http://127.0.0.1:'+port+'/api/domino/wallet/'+route,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    return {status:r.status,data:await r.json()};
  }
  const registered=await post('register',{name:'EmailOwner',email:'owner@example.com'});
  assert.equal(registered.status,200);
  assert.equal(registered.data.verificationRequired,true);
  assert.equal(registered.data.token,undefined,'Unverified registration must not reveal wallet credential');
  const id=registered.data.account.id;
  const readMail=()=>fs.readFileSync(outbox,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(readMail().length,1);
  const code=readMail()[0].code;
  assert.match(code,/^[a-f0-9]{48}$/);
  assert.equal((await post('me',{id,token:'0'.repeat(64)})).status,400);
  assert.equal((await post('verify-email',{id,code:'0'.repeat(48)})).status,400);
  const verified=await post('verify-email',{id,code});
  assert.equal(verified.status,200);
  assert.match(verified.data.token,/^[a-f0-9]{64}$/);
  assert.equal((await post('verify-email',{id,code})).status,400);
  assert.equal((await post('me',{id,token:verified.data.token})).status,200);
  const request=await post('recovery-email',{email:'owner@example.com'});
  assert.equal(request.status,200);
  assert.match(request.data.message,/If that address/);
  const recoveryCode=readMail()[1].code;
  assert.equal((await post('recovery-complete',{email:'elsewhere@example.com',code:recoveryCode})).status,401);
  const recovered=await post('recovery-complete',{email:'owner@example.com',code:recoveryCode});
  assert.equal(recovered.status,200);
  assert.equal(recovered.data.account.id,id);
  assert.equal(recovered.data.account.balance,100);
  assert.equal((await post('me',{id,token:verified.data.token})).status,400);
  assert.equal((await post('me',{id,token:recovered.data.token})).status,200);
  assert.equal((await post('recovery-complete',{email:'owner@example.com',code:recoveryCode})).status,401);
  const unknown=await post('recovery-email',{email:'unknown@example.com'});
  assert.equal(unknown.status,200);
  assert.equal(unknown.data.message,request.data.message,'Unknown account must not be disclosed');
});
