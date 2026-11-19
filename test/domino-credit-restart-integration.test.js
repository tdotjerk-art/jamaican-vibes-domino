'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');
const {io}=require('socket.io-client');

test('a Render-like server restart refunds an interrupted paid public match exactly once',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'domino-credit-restart-'));
  const env={...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
    DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(directory,'wallet.sqlite')};
  let child=null;
  t.after(()=>{child?.kill();fs.rmSync(directory,{recursive:true,force:true});});
  async function start(){
    child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
      env,stdio:['ignore','ignore','pipe','ipc']
    });
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('start timeout')),10000);
      child.once('message',m=>{clearTimeout(timer);resolve('http://127.0.0.1:'+m.port);});
      child.once('exit',code=>{clearTimeout(timer);reject(Error('early exit '+code));});
    });
  }
  async function post(url,route,body){
    const r=await fetch(url+'/api/domino/wallet/'+route,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    return await r.json();
  }
  let url=await start();
  const account=await post(url,'register',{name:'RestartPlayer'});
  const socket=io(url,{transports:['websocket'],reconnection:false});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  const seated=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('seat timeout')),5000);
    socket.once('seat-assigned',seat=>{clearTimeout(timeout);resolve(seat);});
  });
  socket.emit('join-public-table',{accountId:account.account.id,accountToken:account.token});
  await seated;
  const login={id:account.account.id,token:account.token};
  assert.equal((await post(url,'me',login)).balance,90);
  socket.disconnect();
  // Crash the server before the 90-second reconnect grace period expires.
  const dying=child;
  await new Promise(resolve=>{
    dying.once('exit',resolve);
    dying.kill('SIGKILL');
  });
  url=await start();
  assert.equal((await post(url,'me',login)).balance,100);
  assert.equal((await post(url,'me',login)).balance,100);
});
