const express=require('express'),crypto=require('node:crypto'),E=require('./public/ludi/engine');
const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
function createLUDIRouter({rollDie=()=>crypto.randomInt(1,7)}={}){
 const router=express.Router(),rooms=new Map(),rates=new Map(),day=86400000;
 router.use(express.json({limit:'4kb'}));
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='POST'){
   let origin;try{origin=new URL(req.get('origin'))}catch{return res.status(403).json({error:'Invalid origin.'})}
   if(origin.host!==req.get('host'))return res.status(403).json({error:'Invalid origin.'});
   const key=digest(req.get('authorization')||req.socket.remoteAddress||'anonymous'),now=Date.now();
   let rate=rates.get(key);if(!rate||now-rate.start>=60000){rate={start:now,count:0};rates.set(key,rate)}
   if(++rate.count>120)return res.status(429).json({error:'Too many actions. Please slow down.'});
  }
  next();
 });
 function cleanup(){const now=Date.now();for(const [code,r]of rooms)if(r.expires<=now)rooms.delete(code);for(const [key,r]of rates)if(now-r.start>=60000)rates.delete(key)}
 const timer=setInterval(cleanup,60000);timer.unref?.();
 const view=(r,you,token)=>({code:r.code,you,...(token?{token}:{}),version:r.version,total:r.total,players:r.seats.map(p=>p.name),state:r.game,votes:r.votes});
 router.route('/').get(handle).post(handle);
 function handle(req,res){try{
  const a=req.method==='POST'?req.body:{};
  if(!a||typeof a!=='object'||Array.isArray(a))return res.status(400).json({error:'Invalid request.'});
  if(req.method==='POST'&&a.type==='create'){
   const name=E.cleanName(a.name),total=a.total;if(!name)return res.status(400).json({error:'Enter your name to play.'});
   if(!Number.isInteger(total)||total<2||total>4)return res.status(400).json({error:'Choose 2, 3, or 4 players.'});
   cleanup();if(rooms.size>=2000)return res.status(503).json({error:'All tables are busy. Try again later.'});
   let code;do{code=crypto.randomBytes(4).toString('hex').toUpperCase()}while(rooms.has(code));
   const token=crypto.randomBytes(32).toString('hex'),r={code,total,seats:[{name,key:digest(token)}],game:null,version:0,votes:[],expires:Date.now()+day};
   rooms.set(code,r);return res.json(view(r,0,token));
  }
  const code=String(a.code||req.query.code||'').trim().toUpperCase(),r=rooms.get(code);
  if(!r||r.expires<=Date.now())return res.status(404).json({error:'Room not found or expired. Create a new room.'});
  if(req.method==='POST'&&a.type==='join'){
   const name=E.cleanName(a.name);if(!name)return res.status(400).json({error:'Enter your name to play.'});
   if(r.game||r.seats.length>=r.total)return res.status(409).json({error:'This room is full or has already started.'});
   const token=crypto.randomBytes(32).toString('hex');r.seats.push({name,key:digest(token)});r.version++;
   return res.json(view(r,r.seats.length-1,token));
  }
  const token=(req.get('authorization')||'').replace(/^Bearer /,''),you=/^[a-f0-9]{64}$/.test(token)?r.seats.findIndex(p=>p.key===digest(token)):-1;
  if(you<0)return res.status(403).json({error:'Return using this browser’s saved room.'});
  if(req.method==='GET')return res.json(view(r,you));
  if(a.version!==r.version)return res.status(409).json({error:'The board changed. Please try again.'});
  if(a.type==='start'){
   if(you!==0||r.game||r.seats.length!==r.total)return res.status(400).json({error:'The host can start once every player has joined.'});
   r.game=E.fresh(r.seats.map(p=>p.name));
  }else if(a.type==='rematch'){
   if(!r.game)return res.status(400).json({error:'Start the game first.'});
   if(!r.votes.includes(you))r.votes.push(you);
   if(r.votes.length===r.total){r.game=E.fresh(r.seats.map(p=>p.name));r.votes=[];}
  }else{
   if(!r.game)return res.status(400).json({error:'Wait for the host to start.'});
   try{r.game=E.act(r.game,you,a,rollDie);r.votes=[]}catch(e){return res.status(400).json({error:e.message})}
  }
  r.version++;return res.json(view(r,you));
 }catch(error){console.error('LUDI room error:',error);res.status(500).json({error:'Unable to reach the game. Please try again.'})}}
 router.use((error,req,res,next)=>{if(error.type==='entity.too.large')return res.status(413).json({error:'Request too large.'});if(error instanceof SyntaxError)return res.status(400).json({error:'Invalid request.'});next(error)});
 return router;
}
module.exports={createLUDIRouter};
