'use strict';
// Live end-to-end match validation in isolated, unpaid private rooms.
// No public matchmaking, no wallet accounts, no real user rooms.
const {io}=require('socket.io-client');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const base=process.env.DOMINO_SMOKE_URL||'https://jamaican-vibes-domino.onrender.com';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clients=[];
const errors=new WeakMap();
const recentErrors=s=>(errors.get(s)||[]).slice(-5);

function wait(s,event,predicate=()=>true,timeout=20000){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{s.off(event,handler);reject(Error('timeout '+event))},timeout);
  function handler(data){if(!predicate(data))return;clearTimeout(timer);s.off(event,handler);resolve(data)}
  s.on(event,handler);
 });
}
async function connect(){
 const s=io(base,{transports:['websocket'],forceNew:true,reconnection:false});
 clients.push(s);errors.set(s,[]);
 s.on('action-error',message=>errors.get(s).push({at:Date.now(),event:'action-error',message:String(message)}));
 s.on('room-error',message=>errors.get(s).push({at:Date.now(),event:'room-error',message:String(message)}));
 await wait(s,'connect',()=>true,20000);return s;
}
async function room(count,mode) {
 const sockets=[],states=Array(count).fill(null);
 const prefix='E2E'+crypto.randomBytes(4).toString('hex');
 const first=await connect(),assigned=wait(first,'seat-assigned');
 first.on('private-state',x=>{states[0]=x});
 first.emit('create-room',{name:prefix+'0',mode,playerCount:count,target:6});
 const seat=await assigned;sockets.push(first);
 for(let i=1;i<count;i++){
  const s=await connect();sockets.push(s);
  s.on('private-state',x=>{states[i]=x});
  const joined=wait(s,'seat-assigned');
  s.emit('join-room',{code:seat.code,name:prefix+i});await joined;
 }
 const playing=wait(first,'private-state',x=>x.phase==='playing');
 sockets.forEach(s=>s.emit('toggle-ready'));
 const initial=await playing;
 assert.equal(initial.playerCount,count);
 assert.equal(initial.mode,mode);
 return {sockets,states,seat,initial};
}
function ends(board){
 if(!board.length)return [null,null];
 if(board.length===1)return [board[0].a,board[0].b];
 return [board[0].a,board[board.length-1].b];
}
function signature(s){
 return [s.phase,s.handNo,s.board.length,s.turn,s.scores.join(','),s.teamScores.join(','),s.handValue,s.lastEvent].join(':');
}
async function playGame(game,maxMs){
 let {sockets,states}=game;
 const start=Date.now();let moves=0,last=null,handCount=0,blocked=0,passEvents=0;
 while(Date.now()-start<maxMs){
  const current=states[0];if(!current){await delay(70);continue}
  handCount=Math.max(handCount,current.handNo);
  if(current.phase==='match-over'){
   assert.ok(current.scores.every(n=>Number.isInteger(n)&&n>=0&&n<=6));
   assert.ok(current.teamScores.every(n=>Number.isInteger(n)&&n>=0&&n<=6));
   if(current.mode==='individual')assert.ok(current.scores.includes(6),'Cut Throat winner must reach six');
   else assert.ok(current.teamScores.includes(6),'Partners winning team must reach six');
   return {moves,hands:handCount,scores:current.scores,teamScores:current.teamScores,blocked,passEvents,finalMessage:current.message};
  }
  if(current.phase==='choose-poser'){
   const chosen=current.poseOptions?.[0];
   if(Number.isInteger(chosen)&&last!=='poser:'+current.handNo){
    sockets[chosen].emit('choose-poser',{seat:chosen});
    last='poser:'+current.handNo;
   }
   await delay(50);continue;
  }
  if(current.phase==='hand-over'){last=null;await delay(100);continue}
  if(current.phase!=='playing'){await delay(100);continue}
  if(Date.now()<(current.dealUntil||0)+50){await delay(120);continue}
  const seat=current.turn;const my=states[seat];
  if(!Number.isInteger(seat)||!my||my.handNo!==current.handNo){await delay(60);continue}
  const sig=signature(current);
  if(sig===last){await delay(80);continue}
  const [left,right]=ends(current.board);
  const piece=my.hand.find(d=>!current.board.length||d.a===left||d.b===left||d.a===right||d.b===right);
  if(!piece){last=sig;await delay(150);continue}
  const side=piece.a===left||piece.b===left?'left':'right';
  // A board change, hand transition or match completion acknowledges the move.
  // Keep diagnostic server errors rather than reporting every rejection as a timeout.
  const sentAt=Date.now();
  const changed=wait(sockets[0],'private-state',s=>
   s.handNo!==current.handNo||s.phase!==current.phase||
   s.board.length!==current.board.length||
   (s.board.length&&s.board.some(d=>d.id===piece.id&&d.player===seat)),12000);
  sockets[seat].emit('play-domino',{tileId:piece.id,side});
  last=sig;moves++;
  try{
   const updated=await Promise.race([
    changed,
    (async()=>{for(let i=0;i<48;i++){await delay(250);
      const rejected=recentErrors(sockets[seat]).find(e=>e.at>=sentAt);
      if(rejected)throw Error(rejected.event+': '+rejected.message);
    }})()
   ]);
   if(updated.phase==='hand-over'&&updated.lastEvent==='blocked-win')blocked++;
   if(updated.message?.toLowerCase().includes('pass'))passEvents++;
  }catch(e){
   throw Error('Move '+moves+' not acknowledged: '+e.message+
    ' / seat '+seat+' domino '+piece.id+' side '+side+
    ' hand '+current.handNo+' ends '+left+','+right+
    ' phase '+states[0]?.phase+' errors '+JSON.stringify(recentErrors(sockets[seat])));
  }
 }
 throw Error('No match winner within '+maxMs+'ms; moves='+moves+' hands='+handCount+' latest='+JSON.stringify(states[0]&&{phase:states[0].phase,scores:states[0].scores,teamScores:states[0].teamScores,turn:states[0].turn,message:states[0].message}));
}
async function main(){
 const output=[];const failed=[];
 const scenarios=[[2,'individual',240000,true],[3,'individual',240000,false],
  [4,'individual',300000,false],[4,'partner',420000,false]];
 const selected=process.env.DOMINO_MATCH_SCENARIO;
 const picked=selected?scenarios.filter(([count,mode])=>String(count)+'-'+mode===selected):scenarios;
 if(!picked.length)throw Error('Unknown DOMINO_MATCH_SCENARIO: '+selected);
 for(const [count,mode,maxMs,rematch] of picked){
  const title=count+'-player '+(mode==='partner'?'Partners':'Cut Throat');
  let game;
  try{
   game=await room(count,mode);
   const result=await playGame(game,maxMs);
   output.push({test:title,result:'PASS',...result});
   if(rematch){
    const reset=wait(game.sockets[0],'private-state',s=>s.phase==='waiting'&&s.handNo===0,14000);
    game.sockets.forEach(s=>s.emit('rematch-vote'));
    const changed=await reset;
    assert.ok(changed.scores.every(n=>n===0),'Rematch individual scores must reset');
    assert.ok(changed.teamScores.every(n=>n===0),'Rematch teams must reset');
    const next=wait(game.sockets[0],'private-state',s=>s.phase==='playing'&&s.handNo===1,15000);
    game.sockets.forEach(s=>s.emit('toggle-ready'));
    const newDeal=await next;
    assert.equal(newDeal.board.length,1,'Opening double-six should be dealt on rematch');
    output.push({test:title+' rematch vote, reset and new deal',result:'PASS'});
   }
  }catch(e){output.push({test:title,result:'FAIL',error:e.message});failed.push(title)}
  finally{if(game)game.sockets.forEach(s=>s.disconnect());await delay(150)}
 }
 console.log('LIVE COMPLETE MATCH RESULTS');
 console.log(JSON.stringify(output,null,2));
 if(failed.length)process.exitCode=1;
}
main().catch(e=>{console.error('Full match runner failed:',e);process.exitCode=1}).finally(()=>clients.forEach(s=>s.disconnect()));
