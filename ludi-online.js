const express=require('express'),crypto=require('node:crypto'),E=require('./public/ludi/engine');
const fs=require('node:fs'),{createLudiStorage}=require('./ludi-storage');
const {createCommunity,idOK}=require('./ludi-community');
const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
function createLUDIRouter({rollDie=()=>crypto.randomInt(1,7),storageDir=process.env.LUDI_STATE_DIR||(fs.existsSync('/var/data')?'/var/data/ludi-rooms':null)}={}){
 const router=express.Router(),rooms=new Map(),rates=new Map(),day=86400000;
 const storage=createLudiStorage(storageDir),community=createCommunity(storageDir);
 function archive(r){for(const result of r.results||[])community.record(result)}
 // Fail startup on unreadable or damaged saves instead of erasing saved games.
 for(const r of storage.load({keepExpired:true})){archive(r);if(r.expires<=Date.now()){storage.remove(r.code);continue}if(r.publicTable&&!r.game)r.seats=r.seats.map(p=>({...p,lastSeen:Date.now()}));rooms.set(r.code,r)}
 router.storageEnabled=storage.enabled;router.restoredRooms=rooms.size;
 if(storage.enabled)console.log('LUDI durable room storage enabled; restored '+rooms.size+' rooms.');
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
 function cleanup(){pruneQueues();const now=Date.now();for(const [code,r]of rooms){archive(r);if(r.expires<=now){storage.remove(code);clearTimeout(r.rollTimer);rooms.delete(code)}};for(const [key,r]of rates)if(now-r.start>=60000)rates.delete(key)}
 const timer=setInterval(()=>{try{cleanup()}catch(error){console.error('LUDI room cleanup failed:',error)}},15000);timer.unref?.();
 function commit(r,{advance=true}={}){
  const current=rooms.get(r.code),active=r.game&&['roll','move'].includes(r.game.phase);
  const pending=(r.results||[]).filter(result=>!community.hasResult(result.id));
  if(r.game?.phase==='over'&&current?.game?.phase!=='over'&&r.matchId&&r.seats.every(p=>idOK(p.profileId)))pending.push({id:r.matchId,at:Date.now(),players:r.seats.map(p=>({id:p.profileId,name:p.name})),winner:r.seats[r.game.winner].profileId});
  r={...r,results:pending,deadline:active?(advance?Date.now()+10000:r.deadline):null};
  // Save before publishing or acknowledging a changed board.
  try{storage.save(r)}catch(error){error.ludiStorage=true;throw error}
  clearTimeout(current?.rollTimer);rooms.set(r.code,r);scheduleTurn(r);
  try{archive(r)}catch(error){console.error('LUDI records pending retry:',error)}return r;
 }
 // Enforce both online rolls and moves on the server, even if a player disconnects.
 function scheduleTurn(r){
  clearTimeout(r.rollTimer);r.rollTimer=null;
  if(!r.game||!['roll','move'].includes(r.game.phase))return;
  const expectedVersion=r.version,expectedGame=r.game;
  r.rollTimer=setTimeout(()=>{
   if(rooms.get(r.code)!==r||r.version!==expectedVersion||r.game!==expectedGame||r.expires<=Date.now())return;
   try{
    let action={type:'roll'};
    if(r.game.phase==='move'){
     const moves=E.legal(r.game);
     if(!moves.length)return;
     // Prefer using both dice, then captures, then progress toward home.
     const ranked=moves.map(m=>{
      const next=E.act(r.game,r.game.turn,{type:'move',piece:m.piece,die:m.die});
      const follows=next.phase==='move'&&next.turn===r.game.turn?E.legal(next):[];
      return {m,score:(r.game.remaining.length===2&&follows.length?10000:0)+(next.last?.captured?.length||0)*1000+(m.to===E.HOME?250:0)+(m.from<0?60:0)+m.to};
     }).sort((a,b)=>b.score-a.score);
     action={type:'move',piece:ranked[0].m.piece,die:ranked[0].m.die};
    }else if(r.game.phase!=='roll')return;
    commit({...r,game:E.act(r.game,r.game.turn,action,rollDie),version:r.version+1,votes:[]});
   }catch(error){console.error('LUDI automatic turn failed:',error);r.deadline=Date.now()+10000;scheduleTurn(r)}
  },Math.max(0,(r.deadline||Date.now()+10000)-Date.now()));
  r.rollTimer.unref?.();
 }
 function pruneQueues(){
  const cutoff=Date.now()-45000;
  for(const r of rooms.values())if(r.publicTable&&!r.game){
   const seats=r.seats.filter(p=>(p.lastSeen||0)>cutoff);if(seats.length===r.seats.length)continue;
   if(!seats.length){storage.remove(r.code);rooms.delete(r.code)}else commit({...r,seats,version:r.version+1});
  }
 }
 function player(req,a){
  if(a.profileId===undefined)return null;return community.authenticate(a.profileId,req.get('x-ludi-profile-token'));
 }
 function newRoom(name,total,profile,publicTable=false){
  let code;do{code=crypto.randomBytes(4).toString('hex').toUpperCase()}while(rooms.has(code));
  const token=crypto.randomBytes(32).toString('hex'),r={code,total,publicTable,createdAt:Date.now(),seats:[{name,key:digest(token),...(profile?{profileId:profile.id}:{}),lastSeen:Date.now()}],game:null,version:0,votes:[],expires:Date.now()+day,deadline:null,results:[]};
  return {r:commit(r),token};
 }
 router.get('/leaderboard',(req,res)=>res.json({players:community.leaderboard()}));
 router.route('/profile').get(profileRequest).post(profileRequest);
 function profileRequest(req,res){try{
  const a=req.body||{};if(req.method==='POST'&&a.type==='create')return res.json(community.create(a.name));
  const id=req.method==='GET'?req.query.id:a.id;
  return res.json({profile:community.profile(id,req.get('x-ludi-profile-token'),req.method==='POST'&&a.type==='rename'?a.name:undefined)});
 }catch(error){res.status(error.status||503).json({error:error.status?error.message:'Unable to save the player profile. Try again.'})}}
 const view=(r,you,token)=>({code:r.code,you,...(token?{token}:{}),version:r.version,total:r.total,players:r.seats.map(p=>p.name),state:r.game,votes:r.votes,deadline:r.deadline,serverNow:Date.now(),publicTable:!!r.publicTable});
 router.route('/').get(handle).post(handle);
 function handle(req,res){try{
  const a=req.method==='POST'?req.body:{};
  if(!a||typeof a!=='object'||Array.isArray(a))return res.status(400).json({error:'Invalid request.'});
  if(req.method==='POST'&&['create','find'].includes(a.type)){
   const name=E.cleanName(a.name),total=a.total;if(!name)return res.status(400).json({error:'Enter your name to play.'});
   if(!Number.isInteger(total)||total<2||total>4)return res.status(400).json({error:'Choose 2, 3, or 4 players.'});
   cleanup();
   const profile=player(req,a);
   if(a.type==='find'){
    if(!profile)return res.status(400).json({error:'Save a player profile to play at public tables.'});
    const existing=[...rooms.values()].find(r=>r.publicTable&&r.game?.phase!=='over'&&r.seats.some(p=>p.profileId===profile.id));
    const available=existing||[...rooms.values()].filter(r=>r.publicTable&&!r.game&&r.total===total&&r.seats.length<total).sort((a,b)=>(a.createdAt||a.expires-day)-(b.createdAt||b.expires-day)||a.code.localeCompare(b.code))[0];
    if(available){
     const token=crypto.randomBytes(32).toString('hex'),seats=available.seats.map(p=>({...p}));let you=seats.findIndex(p=>p.profileId===profile.id);
     if(you>=0){seats[you].key=digest(token);seats[you].lastSeen=Date.now()}else{you=seats.length;seats.push({name,key:digest(token),profileId:profile.id,lastSeen:Date.now()})}
     const start=!available.game&&seats.length===available.total;
     const r=commit({...available,seats,version:available.version+1,...(start?{game:E.fresh(seats.map(p=>p.name)),matchId:crypto.randomBytes(16).toString('hex')}: {})},{advance:start});return res.json(view(r,you,token));
    }
   }
   if(rooms.size>=2000)return res.status(503).json({error:'All tables are busy. Try again later.'});
   const created=newRoom(name,total,profile,a.type==='find');return res.json(view(created.r,0,created.token));
  }
  const code=String(a.code||req.query.code||'').trim().toUpperCase(),r=rooms.get(code);
  if(!r||r.expires<=Date.now())return res.status(404).json({error:'Room not found or expired. Create a new room.'});
  if(req.method==='POST'&&a.type==='join'){
   const name=E.cleanName(a.name);if(!name)return res.status(400).json({error:'Enter your name to play.'});
   if(r.publicTable)return res.status(400).json({error:'Use Play online to join public tables.'});
   if(r.game||r.seats.length>=r.total)return res.status(409).json({error:'This room is full or has already started.'});
   const profile=player(req,a);if(profile&&r.seats.some(p=>p.profileId===profile.id))return res.status(409).json({error:'This player already has a seat at this table. Return to your saved room.'});
   const token=crypto.randomBytes(32).toString('hex'),joined=commit({...r,seats:[...r.seats,{name,key:digest(token),...(profile?{profileId:profile.id}:{})}],version:r.version+1});
   return res.json(view(joined,joined.seats.length-1,token));
  }
  const token=(req.get('authorization')||'').replace(/^Bearer /,''),you=/^[a-f0-9]{64}$/.test(token)?r.seats.findIndex(p=>p.key===digest(token)):-1;
  if(you<0)return res.status(403).json({error:'Return using this browser’s saved room.'});
  if(req.method==='GET'){let current=r;if(r.publicTable&&!r.game&&Date.now()-(r.seats[you].lastSeen||0)>15000)current=commit({...r,seats:r.seats.map((p,i)=>i===you?{...p,lastSeen:Date.now()}:p)},{advance:false});return res.json(view(current,you))}
  if(a.type==='cancel'){if(!r.publicTable||r.game)return res.status(409).json({error:'This game has started. Return to the table to keep playing.'});const seats=r.seats.filter((p,i)=>i!==you);if(seats.length)commit({...r,seats,version:r.version+1});else{storage.remove(r.code);rooms.delete(r.code)}return res.json({cancelled:true})}
  if(a.version!==r.version)return res.status(409).json({error:'The board changed. Please try again.'});
  let game=r.game,votes=[...r.votes],matchId=r.matchId;
  if(a.type==='start'){
   if(you!==0||r.game||r.seats.length!==r.total)return res.status(400).json({error:'The host can start once every player has joined.'});
   game=E.fresh(r.seats.map(p=>p.name));matchId=crypto.randomBytes(16).toString('hex');
  }else if(a.type==='rematch'){
   if(!r.game)return res.status(400).json({error:'Start the game first.'});
   if(!votes.includes(you))votes.push(you);
   if(votes.length===r.total){game=E.fresh(r.seats.map(p=>p.name));matchId=crypto.randomBytes(16).toString('hex');votes=[];}
  }else{
   if(!r.game)return res.status(400).json({error:'Wait for the host to start.'});
   try{game=E.act(r.game,you,a,rollDie);votes=[]}catch(e){return res.status(400).json({error:e.message})}
  }
  const updated=commit({...r,game,votes,matchId,version:r.version+1},{advance:game!==r.game});return res.json(view(updated,you));
 }catch(error){console.error('LUDI room error:',error);res.status(error.status||(error.ludiStorage?503:500)).json({error:error.status?error.message:error.ludiStorage?'Unable to save the game. Please try again.':'Unable to reach the game. Please try again.'})}}
 router.use((error,req,res,next)=>{if(error.type==='entity.too.large')return res.status(413).json({error:'Request too large.'});if(error instanceof SyntaxError)return res.status(400).json({error:'Invalid request.'});next(error)});
 // Do not play missed turns while the server was offline. Restored active games
 // resume from the exact saved board with a fresh ten seconds to reconnect.
 for(const r of rooms.values()){if(r.game&&r.game.phase!=='over')r.deadline=Date.now()+10000;scheduleTurn(r)}
 router.close=()=>{clearInterval(timer);for(const r of rooms.values())clearTimeout(r.rollTimer)};
 return router;
}
module.exports={createLUDIRouter};
