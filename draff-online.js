const express=require('express');
const crypto=require('node:crypto');
const gameModule=import('./draff/game.mjs');
const DAY=24*60*60*1000;
const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
function createDraffRouter(){
 const router=express.Router(),rooms=new Map(),rates=new Map();
 router.use(express.json({limit:'4kb'}));
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='POST'){
   let origin;try{origin=new URL(req.get('origin'));}catch{return res.status(403).json({error:'Invalid origin.'});}
   if(origin.host!==req.get('host'))return res.status(403).json({error:'Invalid origin.'});
  }
  // Cap writes per connection address. Do not trust arbitrary forwarded headers.
  if(req.method==='POST'){
   const now=Date.now(),ip=req.get('authorization')?digest(req.get('authorization')):'anonymous:'+(req.socket.remoteAddress||'unknown');let rate=rates.get(ip);
   if(!rate||now-rate.start>60000){rate={start:now,count:0};rates.set(ip,rate);}
   if(++rate.count>120)return res.status(429).json({error:'Too many actions. Please slow down.'});
  }
  next();
 });
 const cleanup=()=>{let now=Date.now();for(const [c,r] of rooms)if(r.expires<=now)rooms.delete(c);for(const [ip,r] of rates)if(now-r.start>60000)rates.delete(ip)};
 const timer=setInterval(cleanup,60000);timer.unref?.();
 router.get('/',handle);router.post('/',handle);
 async function handle(req,res){try{
  const {fresh,act,view}=await gameModule,a=req.method==='POST'?req.body:{};
  if(!a||typeof a!=='object'||Array.isArray(a))return res.status(400).json({error:'Invalid request.'});
  if(req.method==='POST'&&a.type==='create'){
   cleanup();if(rooms.size>=2000)return res.status(503).json({error:'All tables are busy. Try again later.'});
   let code;do{code=[...crypto.randomBytes(8)].map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('')}while(rooms.has(code));
   let token=crypto.randomBytes(32).toString('hex'),state=fresh();rooms.set(code,{host:digest(token),guest:null,state,version:0,expires:Date.now()+DAY});
   return res.json({code,token,you:1,version:0,state:view(state)});
  }
  let code=String(a.code||req.query.code||'').toUpperCase();if(!/^[A-Z2-9]{8}$/.test(code))return res.status(400).json({error:'Enter the 8-character room code.'});
  let r=rooms.get(code);if(!r||r.expires<=Date.now())return res.status(404).json({error:'Room not found or expired. Create a new room.'});
  if(req.method==='POST'&&a.type==='join'){
   if(r.guest)return res.status(409).json({error:'This room already has two players.'});
   const token=crypto.randomBytes(32).toString('hex');r.guest=digest(token);r.state.active=true;r.version++;
   return res.json({code,token,you:-1,version:r.version,state:view(r.state)});
  }
  const token=(req.get('authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'Return using this device’s saved room.'});
  let identity=digest(token),you=identity===r.host?1:identity===r.guest?-1:0;
  if(!you)return res.status(403).json({error:'You are not a player in this room.'});
  if(req.method==='GET')return res.json({code,you,version:r.version,state:view(r.state)});
  if(a.version!==r.version)return res.status(409).json({error:'The board changed. Please try again.'});
  let next;try{next=act(r.state,you,a)}catch(e){return res.status(400).json({error:e.message});}
  // No asynchronous work between checking the revision and updating it.
  r.state=next;r.version++;
  return res.json({code,you,version:r.version,state:view(next)});
 }catch(error){console.error('Draff room error:',error);res.status(500).json({error:'Unable to reach the game. Please try again.'});}}
 router.use((error,req,res,next)=>{if(error.type==='entity.too.large')return res.status(413).json({error:'Request too large.'});if(error instanceof SyntaxError)return res.status(400).json({error:'Invalid request.'});next(error)});
 return router;
}
module.exports={createDraffRouter};
