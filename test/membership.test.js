const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Stripe=require('stripe');
const {createMembership}=require('../membership');

test('accounts, recovery, persistent stats and verified subscription lifecycle',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jv-members-'));
  const dbPath=path.join(root,'members.sqlite');
  const app=express(), server=http.createServer(app);
  const secret='whsec_test_only', price='price_test', sdk=new Stripe('sk_test_local_only');
  process.env.STRIPE_VIP_PRICE_ID=price;process.env.STRIPE_WEBHOOK_SECRET=secret;
  let sub={id:'sub_test',customer:'cus_test',status:'active',items:{data:[{price:{id:price},current_period_end:Math.floor(Date.now()/1000)+86400}]}};
  const fake={webhooks:sdk.webhooks,subscriptions:{retrieve:async()=>sub,list:async()=>({data:[]})},
    prices:{retrieve:async()=>({id:price,active:true,currency:'cad',unit_amount:999,recurring:{interval:'month',interval_count:1}})},
    customers:{create:async()=>({id:'cus_test'})},checkout:{sessions:{list:async()=>({data:[]}),create:async()=>({url:'https://checkout.stripe.com/test'})}}};
  const membership=createMembership(app,{dbPath,stripeClient:fake});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const call=async(route,body,origin='http://localhost:3000')=>{
    const res=await fetch(url+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
    return {status:res.status,body:await res.json()};
  };
  const webhook=async(type,id='evt_'+crypto.randomUUID(),valid=true)=>{
    const payload=JSON.stringify({id,type,data:{object:{id:'sub_test'}}});
    const signature=sdk.webhooks.generateTestHeaderString({payload,secret:valid?secret:'wrong'});
    return fetch(url+'/api/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature},body:payload});
  };
  try{
    assert.equal((await call('register',{email:'a@example.com',name:'Junior',password:'long-secure-password'},'https://evil.example')).status,403);
    const registered=await call('register',{email:'a@example.com',name:'Junior',password:'long-secure-password'});
    assert.equal(registered.status,201);const id=registered.body.user.id, recovery=registered.body.recoveryCode, oldCookie=cookie;
    assert.equal((await call('me')).body.user.vip,false);
    assert.equal((await call('theme',{theme:'gold'})).status,403);
    assert.equal((await call('billing/checkout',{})).body.url,'https://checkout.stripe.com/test');
    assert.equal((await call('me')).body.user.vip,false,'checkout redirect must not activate VIP');
    assert.equal((await webhook('customer.subscription.updated','evt_bad',false)).status,400);
    assert.equal((await webhook('customer.subscription.updated','evt_active')).status,200);
    assert.equal((await call('me')).body.user.vip,true);
    assert.equal((await call('theme',{theme:'gold'})).status,200);
    assert.equal((await webhook('customer.subscription.updated','evt_active')).status,200,'duplicate delivery is safe');
    assert.equal(membership.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
    const room={matchId:'match_one',mode:'partner',players:[{userId:id},null,null,null]};
    membership.recordMatch(room,0);membership.recordMatch(room,0);
    assert.equal((await call('stats')).body.totals.matches,1,'match results must not double count');
    assert.equal((await call('stats')).body.recent.length,1);
    sub={...sub,status:'canceled'};
    assert.equal((await webhook('customer.subscription.deleted')).status,200);
    assert.equal((await call('me')).body.user.vip,false);
    assert.equal((await call('me')).body.user.theme,'classic');
    assert.equal((await call('theme',{theme:'gold'})).status,403);
    const reset=await call('recover',{email:'a@example.com',recoveryCode:recovery,password:'new-secure-password'});
    assert.equal(reset.status,200);assert.notEqual(reset.body.recoveryCode,recovery);
    const newCookie=cookie;cookie=oldCookie;assert.equal((await call('me')).body.user,null,'recovery revokes existing sessions');cookie=newCookie;
    assert.equal((await call('recover',{email:'a@example.com',recoveryCode:recovery,password:'new-secure-password'})).status,400);
    await call('logout',{});assert.equal((await call('me')).body.user,null);
    assert.equal((await call('login',{email:'a@example.com',password:'long-secure-password'})).status,401);
    assert.equal((await call('login',{email:'a@example.com',password:'new-secure-password'})).status,200);
    membership.db.close();
    const reopened=createMembership(express(),{dbPath});
    assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
    assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM matches').get().n,1);
    reopened.db.close();
  }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});delete process.env.STRIPE_VIP_PRICE_ID;delete process.env.STRIPE_WEBHOOK_SECRET;}
});
