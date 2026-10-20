const crypto=require('crypto');
const {Game}=require('./public/three-cards-engine');
function installThreeCards(io){
 const nsp=io.of('/three-cards'),rooms=new Map();
 const clean=v=>String(v||'').replace(/[\x00-\x1f]/g,'').trim().slice(0,20);
 const valid=n=>Number.isInteger(n)&&n>=5&&n<=1000&&n%5===0;
 function broadcast(r){for(let i=0;i<r.seats.length;i++){const p=r.seats[i];if(p.id)nsp.to(p.id).emit('state',{code:r.code,seat:i,phase:r.game?'game':'lobby',host:0,seats:r.seats.map(p=>({name:p.name,connected:!!p.id,total:p.total,ready:p.ready,extension:p.extension})),game:r.game?.view(i)||null});}}
 function locate(s){const r=rooms.get(s.data.code),i=s.data.seat;if(!r||!Number.isInteger(i)||r.seats[i]?.id!==s.id)return [];return [r,i];}
 nsp.on('connection',s=>{
  let count=0,windowStart=Date.now();s.use((packet,next)=>{if(Date.now()-windowStart>1000){count=0;windowStart=Date.now();}if(++count>25)return;next();});
  const error=m=>s.emit('card-error',m);
  const assign=(r,i)=>{s.data.code=r.code;s.data.seat=i;s.emit('assigned',{code:r.code,token:r.seats[i].token});broadcast(r);};
  s.on('create',(d={})=>{if(s.data.code)return error('Leave your current table first.');const name=clean(d.name);if(!name)return error('Enter your name.');if(rooms.size>=100)return error('Tables are busy. Please try again later.');let code;do code=crypto.randomBytes(3).toString('hex').toUpperCase();while(rooms.has(code));const r={code,seats:[{name,id:s.id,token:crypto.randomBytes(24).toString('hex'),total:valid(d.total)?d.total:5,ready:false,extension:null}],game:null};rooms.set(code,r);assign(r,0);});
  s.on('join',(d={})=>{if(s.data.code)return error('Leave your current table first.');const r=rooms.get(String(d.code||'').toUpperCase().trim()),name=clean(d.name);if(!r)return error('Table not found.');if(r.game)return error('That session has already started.');if(!name)return error('Enter your name.');if(r.seats.length>=4)return error('That table is full.');r.seats.forEach(p=>p.ready=false);r.seats.push({name,id:s.id,token:crypto.randomBytes(24).toString('hex'),total:valid(d.total)?d.total:5,ready:false,extension:null});assign(r,r.seats.length-1);});
  s.on('resume',(d={})=>{if(s.data.code)return;const r=rooms.get(String(d.code||'')),i=r?.seats.findIndex(p=>p.token===d.token);if(!r||i<0)return error('This table is no longer available. Create a new one.');const p=r.seats[i];if(p.id)return error('This seat is already connected. Close the other tab first.');p.id=s.id;assign(r,i);});
  s.on('choice',(d={})=>{const [r,i]=locate(s);if(!r||r.game||!valid(d.total))return;r.seats[i].total=d.total;r.seats.forEach(p=>p.ready=false);broadcast(r);});
  s.on('ready',()=>{const [r,i]=locate(s);if(!r||r.game)return;r.seats[i].ready=!r.seats[i].ready;broadcast(r);});
  s.on('start',()=>{const [r,i]=locate(s);if(!r||i!==0||r.game)return;if(r.seats.length<2||r.seats.length>4||!r.seats.every(p=>p.id&&p.ready&&p.total===r.seats[0].total))return error('Two to four players must connect, choose the same game count, and tap Ready.');r.game=new Game(r.seats.map(p=>p.name),r.seats[0].total);broadcast(r);});
  s.on('action',(d={})=>{const [r,i]=locate(s);if(!r?.game)return;if(!r.seats.every(p=>p.id))return error('Play is paused until everyone reconnects.');const g=r.game;let ok=false;
   if(d.type==='pick')ok=g.pick(i);if(d.type==='deal')ok=g.deal(i);if(d.type==='declare')ok=g.declare(i,d.claim);if(d.type==='draw')ok=g.draw(i);if(d.type==='pass')ok=g.pass(i);if(d.type==='play')ok=g.play(i,d.match,d.other);if(d.type==='next')ok=g.next();
   if(!ok)return error('That move is not available now.');broadcast(r);
  });
  s.on('extend',(d={})=>{const [r,i]=locate(s);if(!r?.game||r.game.phase!=='session-over'||!valid(d.amount)||r.game.total+d.amount>1000)return;r.seats[i].extension=d.amount;if(r.seats.every(p=>p.id&&p.extension===d.amount)){r.game.extend(d.amount);r.seats.forEach(p=>p.extension=null);}broadcast(r);});
  s.on('leave',()=>{const [r,i]=locate(s);if(!r)return;if(!r.game){r.seats.splice(i,1);r.seats.forEach((p,j)=>{p.ready=false;const peer=nsp.sockets.get(p.id);if(peer)peer.data.seat=j;});s.data={};if(!r.seats.length)rooms.delete(r.code);else broadcast(r);}else{r.seats[i].id=null;s.data={};broadcast(r);}});
  s.on('disconnect',()=>{const [r,i]=locate(s);if(!r)return;r.seats[i].id=null;r.seats[i].ready=false;broadcast(r);});
 });
 const cleanup=setInterval(()=>{for(const [code,r]of rooms){if(r.seats.every(p=>!p.id)){r.offlineSince??=Date.now();if(Date.now()-r.offlineSince>30*60*1000)rooms.delete(code);}else r.offlineSince=null;}},60000);cleanup.unref();
 nsp.on('close',()=>clearInterval(cleanup));return {rooms};
}
module.exports={installThreeCards};
