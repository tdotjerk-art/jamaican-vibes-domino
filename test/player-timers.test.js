const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {besideHand}=require('../public/player-timers');
const rect=(x,y,w,h)=>({left:x,right:x+w,top:y,bottom:y+h,width:w,height:h});

test('all four clocks follow the rightmost visible domino, including wrapped hands',()=>{
 for(const tiles of [
  Array.from({length:7},(_,i)=>rect(200+i*35,300,32,60)),
  Array.from({length:7},(_,i)=>rect(670+(i%2)*35,70+Math.floor(i/2)*63,32,60)),
  Array.from({length:7},(_,i)=>rect(200+i*35,20,32,60)),
  Array.from({length:7},(_,i)=>rect(30,70+i*35,30,32))
 ]){
  const pos=besideHand(tiles,800,500);
  assert.equal(pos.left,Math.max(...tiles.map(t=>t.right))+5);
  for(const t of tiles)assert.ok(pos.left>t.right);
  const shorter=besideHand(tiles.slice(0,1),800,500);
  assert.equal(shorter.left,tiles[0].right+5);
 }
 assert.equal(besideHand([],800,500),null);
 const edge=besideHand([rect(345,100,28,48)],400,300);
 assert.ok(edge.left+edge.width<=397);
});

test('only the current player clock shows and it clears immediately on play or hand end',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const paint=html.slice(html.indexOf('function paintTurnTimer(){'),html.indexOf('\nfunction autoPlayRandomHumanTile'));
 const timers=Array.from({length:4},()=>({textContent:'',classList:{toggle(_,active){this.active=active;}}}));
 const ctx={hands:[[1],[1],[1],[1]],turn:0,gameOver:false,board:[1],poseTimerInterval:null,turnTimerSeconds:19,turnTimeForPlayer:()=>20,window:{},$:id=>id==='turnTimer'?{}:timers[Number(id.slice(-1))-1]};
 vm.createContext(ctx);vm.runInContext(paint,ctx);
 for(let i=0;i<4;i++){
  ctx.turn=i;ctx.paintTurnTimer();
  assert.deepEqual(timers.map(t=>t.classList.active),timers.map((_,j)=>j===i));
  timers.forEach((t,j)=>{if(j!==i)assert.equal(t.textContent,'');});
 }
 ctx.gameOver=true;ctx.paintTurnTimer();assert.ok(timers.every(t=>!t.classList.active&&t.textContent===''));
 ctx.gameOver=false;ctx.turn=null;ctx.paintTurnTimer();assert.ok(timers.every(t=>!t.classList.active));
 assert.match(html,/updateTurnLights\(\);\s+paintTurnTimer\(\);/);
 assert.doesNotMatch(html,/fixedTimerPositions|TIMER POSITION — PLAYER'S RIGHT-HAND SIDE/);
});
