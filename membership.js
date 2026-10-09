const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const Stripe = require('stripe');
const scrypt = promisify(crypto.scrypt);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');

function createMembership(app, { dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'members.sqlite'), stripeClient } = {}) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password TEXT NOT NULL, recovery TEXT NOT NULL, customer TEXT UNIQUE,
      theme TEXT NOT NULL DEFAULT 'classic', created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), status TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT NOT NULL, user_id TEXT REFERENCES users(id), won INTEGER NOT NULL, mode TEXT NOT NULL,
      completed INTEGER NOT NULL, PRIMARY KEY(id,user_id));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, processed INTEGER NOT NULL);`);
  const stripe = stripeClient || (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);
  const production = process.env.NODE_ENV === 'production';
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (production && (!process.env.APP_URL || !base.startsWith('https://'))) throw new Error('Set APP_URL to the public HTTPS address.');
  const configured = () => !!(stripe && process.env.STRIPE_VIP_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
  const userById = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const vip = id => !!db.prepare("SELECT 1 FROM subscriptions WHERE user_id=? AND status IN ('active','trialing') AND expires>? LIMIT 1").get(id, Math.floor(Date.now()/1000));
  const readUser = headers => {
    const token = /(?:^|;\s*)jv_session=([a-f0-9]{64})(?:;|$)/.exec(headers.cookie || '')?.[1];
    if (!token) return null;
    return db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?').get(digest(token), Date.now()) || null;
  };
  const publicUser = u => u ? { id:u.id, name:u.name, email:u.email, vip:vip(u.id), theme:vip(u.id)?u.theme:'classic', hasBilling:!!u.customer } : null;
  const cookie = (res, token, age=2592000) => res.setHeader('Set-Cookie', `jv_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${production?'; Secure':''}`);
  function issueSession(res,u) {
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    const token=random();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),u.id,Date.now()+2592000000);cookie(res,token);
  }
  const attempts = new Map();
  function limit(req,res,next) {
    const key=req.ip, now=Date.now();
    for(const [k,v] of attempts) if(v.reset<now) attempts.delete(k);
    const item=attempts.get(key)||{count:0,reset:now+600000};
    attempts.set(key,item);if(++item.count>30)return res.status(429).json({error:'Too many attempts. Try again in ten minutes.'});next();
  }
  function sameOrigin(req,res,next) {
    if(req.get('Origin')!==new URL(base).origin)return res.status(403).json({error:'Request origin is not allowed.'});next();
  }
  function authenticated(req,res,next) {
    req.member=readUser(req.headers);if(!req.member)return res.status(401).json({error:'Sign in first.'});next();
  }
  const validatePassword = p => typeof p==='string'&&p.length>=12&&p.length<=128;
  async function hashPassword(password) {
    const salt=crypto.randomBytes(16).toString('hex');
    const key=await scrypt(password,salt,64);return `${salt}:${key.toString('hex')}`;
  }
  async function checkPassword(password,stored) {
    const [salt,hash]=stored.split(':');const key=await scrypt(password,salt,64);
    return crypto.timingSafeEqual(key,Buffer.from(hash,'hex'));
  }
  const json = require('express').json({limit:'16kb'});
  app.use('/api', (_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.post('/api/billing/webhook',require('express').raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
    if(!configured())return res.status(503).json({error:'Billing is not connected.'});
    let event;
    try { event=stripe.webhooks.constructEvent(req.body,req.get('Stripe-Signature'),process.env.STRIPE_WEBHOOK_SECRET); }
    catch { return res.status(400).json({error:'Invalid webhook signature.'}); }
    if(db.prepare('SELECT 1 FROM events WHERE id=?').get(event.id))return res.json({received:true});
    try {
      let id=null;
      if(event.type.startsWith('customer.subscription.'))id=event.data.object.id;
      if(event.type.startsWith('checkout.session.'))id=event.data.object.subscription;
      if(event.type.startsWith('invoice.'))id=event.data.object.subscription || event.data.object.parent?.subscription_details?.subscription;
      // Fetch current state instead of trusting an old event delivered out of order.
      if(id)await syncSubscription(typeof id==='string'?id:id.id);
      db.prepare('INSERT OR IGNORE INTO events VALUES(?,?)').run(event.id,Date.now());
      res.json({received:true});
    } catch { res.status(502).json({error:'Subscription sync failed. Please retry.'}); }
  });
  async function syncSubscription(id) {
    const sub=await stripe.subscriptions.retrieve(id);
    const customer=typeof sub.customer==='string'?sub.customer:sub.customer.id;
    const owner=db.prepare('SELECT * FROM users WHERE customer=?').get(customer);
    if(!owner)return;
    const item=sub.items.data.find(x=>x.price.id===process.env.STRIPE_VIP_PRICE_ID);
    const expires=item?.current_period_end||sub.current_period_end||0;
    db.prepare('INSERT INTO subscriptions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,expires=excluded.expires')
      .run(sub.id,owner.id,item?sub.status:'inactive',expires);
  }
  app.get('/api/me',(req,res)=>res.json({user:publicUser(readUser(req.headers)),billingReady:configured()}));
  app.post('/api/register',sameOrigin,limit,json,async(req,res)=>{
    const email=String(req.body.email||'').trim().toLowerCase(), name=String(req.body.name||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>20||!validatePassword(req.body.password))
      return res.status(400).json({error:'Enter a valid email, name (up to 20 characters) and password (12–128 characters).'});
    const recovery=random(), u={id:crypto.randomUUID(),email,name,password:await hashPassword(req.body.password)};
    try { db.prepare('INSERT INTO users(id,email,name,password,recovery,created) VALUES(?,?,?,?,?,?)').run(u.id,email,name,u.password,digest(recovery),Date.now()); }
    catch { return res.status(409).json({error:'Unable to create that account. Try signing in.'}); }
    issueSession(res,u);res.status(201).json({user:publicUser(userById(u.id)),recoveryCode:recovery});
  });
  // Do the same expensive hash for unknown accounts to reduce timing differences.
  const dummyHash=hashPassword(random());
  app.post('/api/login',sameOrigin,limit,json,async(req,res)=>{
    if(!validatePassword(req.body.password))return res.status(401).json({error:'Email or password is incorrect.'});
    const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email||'').trim().toLowerCase());
    const valid=await checkPassword(req.body.password,u?.password||await dummyHash);
    if(!u||!valid)return res.status(401).json({error:'Email or password is incorrect.'});
    issueSession(res,u);res.json({user:publicUser(u)});
  });
  app.post('/api/recover',sameOrigin,limit,json,async(req,res)=>{
    const code=String(req.body.recoveryCode||'');
    const u=db.prepare('SELECT * FROM users WHERE email=? AND recovery=?').get(String(req.body.email||'').trim().toLowerCase(),digest(code));
    if(!u||!validatePassword(req.body.password))return res.status(400).json({error:'Check your recovery code, email and new password (12–128 characters).'});
    const recovery=random(), password=await hashPassword(req.body.password);
    db.prepare('UPDATE users SET password=?, recovery=? WHERE id=?').run(password,digest(recovery),u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    issueSession(res,u);res.json({user:publicUser(userById(u.id)),recoveryCode:recovery});
  });
  app.post('/api/logout',sameOrigin,(req,res)=>{
    const token=/(?:^|;\s*)jv_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
    if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));cookie(res,'',0);res.json({ok:true});
  });
  app.get('/api/stats',authenticated,(req,res)=>{
    const totals=db.prepare('SELECT COUNT(*) AS matches, COALESCE(SUM(won),0) AS wins FROM matches WHERE user_id=?').get(req.member.id);
    const recent=vip(req.member.id)?db.prepare('SELECT won,mode,completed FROM matches WHERE user_id=? ORDER BY completed DESC LIMIT 20').all(req.member.id):[];
    res.json({totals,recent});
  });
  app.post('/api/theme',sameOrigin,authenticated,json,(req,res)=>{
    const theme=req.body.theme;if(!['classic','gold','emerald'].includes(theme))return res.status(400).json({error:'Unknown design.'});
    if(theme!=='classic'&&!vip(req.member.id))return res.status(403).json({error:'VIP membership required.'});
    db.prepare('UPDATE users SET theme=? WHERE id=?').run(theme,req.member.id);res.json({user:publicUser(userById(req.member.id))});
  });
  app.post('/api/billing/checkout',sameOrigin,limit,authenticated,json,async(req,res)=>{
    if(!configured())return res.status(503).json({error:'Membership payments are not connected yet. Free play is available.'});
    if(vip(req.member.id))return res.status(409).json({error:'You already have VIP. Use Manage membership.'});
    try {
      const price=await stripe.prices.retrieve(process.env.STRIPE_VIP_PRICE_ID);
      if(!price.active||price.currency!=='cad'||price.unit_amount!==999||price.recurring?.interval!=='month'||price.recurring.interval_count!==1)
        return res.status(503).json({error:'The membership price needs to be configured by the owner.'});
      let customer=req.member.customer;
      if(!customer){
        const c=await stripe.customers.create({email:req.member.email,name:req.member.name,metadata:{userId:req.member.id}},{idempotencyKey:`customer-${req.member.id}`});
        customer=c.id;db.prepare('UPDATE users SET customer=? WHERE id=?').run(customer,req.member.id);
      }
      // Reuse an outstanding Checkout to prevent double-clicks creating duplicate subscriptions.
      const subscriptions=await stripe.subscriptions.list({customer,status:'all',limit:100});
      if(subscriptions.data.some(s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status)))
        return res.status(409).json({error:'An existing membership needs attention. Use Manage membership.'});
      const open=await stripe.checkout.sessions.list({customer,status:'open',limit:10});
      let session=open.data.find(s=>s.metadata?.userId===req.member.id&&s.mode==='subscription');
      if(!session)session=await stripe.checkout.sessions.create({mode:'subscription',customer,
        line_items:[{price:price.id,quantity:1}],client_reference_id:req.member.id,metadata:{userId:req.member.id},
        subscription_data:{metadata:{userId:req.member.id}},success_url:`${base}/?billing=success`,cancel_url:`${base}/?billing=cancelled`
      },{idempotencyKey:`checkout-${req.member.id}-${Math.floor(Date.now()/60000)}`});
      res.json({url:session.url});
    }catch { res.status(502).json({error:'Unable to open payments. Please try again.'}); }
  });
  app.post('/api/billing/portal',sameOrigin,limit,authenticated,json,async(req,res)=>{
    if(!configured()||!req.member.customer)return res.status(409).json({error:'No billing account is connected.'});
    try { const session=await stripe.billingPortal.sessions.create({customer:req.member.customer,return_url:base});res.json({url:session.url}); }
    catch {res.status(502).json({error:'Unable to open membership management.'});}
  });
  function recordMatch(room,winner) {
    db.exec('BEGIN');
    try {
      const members=new Map();
      room.players.forEach((p,seat)=>{if(p?.userId&&!members.has(p.userId))members.set(p.userId,room.mode==='partner'?seat%2===winner:seat===winner);});
      for(const [id,won] of members)db.prepare('INSERT OR IGNORE INTO matches VALUES(?,?,?,?,?)').run(room.matchId,id,Number(won),room.mode,Date.now());
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  return {db,readUser,publicUser,vip,recordMatch};
}
module.exports={createMembership};
