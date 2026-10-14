const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Stripe=require('stripe');

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(t,stripeClient){
  // Gate real scrypt callbacks to force credential changes during hashing,
  // without relying on timing sleeps or changing the production API.
  const gates=[],routes={},module={exports:{}};
  const controlledCrypto={...crypto,scrypt(...args){
    const callback=args.pop(),gate=gates.shift();
    gate?.entered.resolve();
    crypto.scrypt(...args,(error,key)=>{
      if(gate)gate.release.promise.then(()=>callback(error,key));
      else callback(error,key);
    });
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../membership.js'),'utf8'),{
    module,require:name=>name==='node:crypto'?controlledCrypto:require(name),
    process,Buffer,__dirname:path.join(__dirname,'..')
  });
  const app={use(){},get(){},post(route,...handlers){routes[route]=handlers.at(-1);}};
  const membership=module.exports.createMembership(app,{dbPath:':memory:',stripeClient});
  t.after(()=>membership.db.close());
  const response=()=>({statusCode:200,headers:{},status(n){this.statusCode=n;return this;},
    setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return this;}});
  const call=async(route,body,headers={})=>{
    const res=response();await routes['/api/'+route]({body,headers,get:name=>headers[name]},res);return res;
  };
  return {membership,call,gate(){const gate={entered:deferred(),release:deferred()};gates.push(gate);return gate;}};
}
const account={email:'race@example.com',name:'Player',password:'original-password-123'};

test('one recovery code can only be consumed by one concurrent request',async t=>{
  const f=fixture(t),registered=await f.call('register',account);
  const first=f.gate(),second=f.gate();
  const reset=password=>f.call('recover',{...account,recoveryCode:registered.body.recoveryCode,password});
  const a=reset('replacement-password-111'),b=reset('replacement-password-222');
  await Promise.all([first.entered.promise,second.entered.promise]);
  first.release.resolve();const winner=await a;
  second.release.resolve();const loser=await b;
  assert.equal(winner.statusCode,200);assert.equal(loser.statusCode,400);
  assert.equal((await f.call('login',{...account,password:'replacement-password-111'})).statusCode,200);
  assert.equal((await f.call('login',{...account,password:'replacement-password-222'})).statusCode,401);
  assert.equal(f.membership.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,2);
});

test('a login verified against pre-recovery credentials cannot issue a new session',async t=>{
  const f=fixture(t),registered=await f.call('register',account);
  const gate=f.gate(),login=f.call('login',account);
  await gate.entered.promise;
  const recovered=await f.call('recover',{...account,recoveryCode:registered.body.recoveryCode,password:'replacement-password-123'});
  assert.equal(recovered.statusCode,200);
  gate.release.resolve();assert.equal((await login).statusCode,401);
  assert.equal(f.membership.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
});

function billing(t,retrieve){
  const price='price_race',secret='whsec_race',sdk=new Stripe('sk_test_local_only');
  const previous={price:process.env.STRIPE_VIP_PRICE_ID,secret:process.env.STRIPE_WEBHOOK_SECRET};
  process.env.STRIPE_VIP_PRICE_ID=price;process.env.STRIPE_WEBHOOK_SECRET=secret;
  t.after(()=>{
    for(const [key,value] of [['STRIPE_VIP_PRICE_ID',previous.price],['STRIPE_WEBHOOK_SECRET',previous.secret]]){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  });
  const f=fixture(t,{webhooks:sdk.webhooks,subscriptions:{retrieve}});
  f.subscription=status=>({id:'sub_race',customer:'cus_race',status,
    items:{data:[{price:{id:price},current_period_end:Math.floor(Date.now()/1000)+3600}]}});
  f.webhook=id=>{
    const payload=JSON.stringify({id,type:'customer.subscription.updated',data:{object:{id:'sub_race'}}});
    return f.call('billing/webhook',Buffer.from(payload),{'Stripe-Signature':sdk.webhooks.generateTestHeaderString({payload,secret})});
  };
  f.owner=async()=>{
    const registered=await f.call('register',account),id=registered.body.user.id;
    f.membership.db.prepare('UPDATE users SET customer=? WHERE id=?').run('cus_race',id);return id;
  };
  return f;
}

test('overlapping signed webhooks serialize current-state retrieval and deduplicate queued deliveries',async t=>{
  const firstEntered=deferred(),release=deferred();let calls=0;
  const f=billing(t,async()=>{
    if(++calls===1){firstEntered.resolve();await release.promise;return f.subscription('active');}
    return f.subscription('canceled');
  });
  const id=await f.owner(),first=f.webhook('evt_active');await firstEntered.promise;
  const second=f.webhook('evt_cancel'),duplicate=f.webhook('evt_cancel');
  await new Promise(setImmediate);
  const inFlight=calls;release.resolve();
  const results=await Promise.all([first,second,duplicate]);
  assert.equal(inFlight,1,'second retrieval must wait for the first write');
  assert.ok(results.every(r=>r.statusCode===200));assert.equal(calls,2);
  assert.equal(f.membership.vip(id),false);
  assert.equal(f.membership.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,2);
});

test('a failed subscription retrieval leaves its event retryable and does not poison the queue',async t=>{
  let calls=0;const f=billing(t,async()=>{if(++calls===1)throw new Error('Stripe unavailable');return f.subscription('active');});
  const id=await f.owner();
  const results=await Promise.all([f.webhook('evt_retry'),f.webhook('evt_retry')]);
  assert.deepEqual(results.map(r=>r.statusCode),[502,200]);assert.equal(calls,2);
  assert.equal(f.membership.vip(id),true);
  assert.equal(f.membership.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
});
