const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {finishWin,finishBlocked,nextHand}=require('../server');

function room(){return {
 code:'BRUCK',mode:'partner',target:6,players:Array.from({length:4},(_,seat)=>({seat,name:`P${seat+1}`,connected:true})),
 spectators:new Map(),rematchVotes:new Set(),history:[],hands:[[{a:6,b:6}],[{a:0,b:0}],[{a:5,b:5}],[{a:4,b:4}]],
 board:[],handNo:4,handValue:1,scores:[0,0,0,0],teamScores:[3,0],bruckStartTeam:0,bruckStartCount:3,
 oneOnePlayTwo:false,nextPlayFor:1,lastWinnerTeam:0,phase:'playing'
};}
function checkRestart(r){
 assert.deepEqual(r.teamScores,[0,0]);
 assert.deepEqual(r.scores,[0,0,0,0]);
 assert.equal(r.doubleSixPoseAfterBruck,true);
 nextHand(r);
 try{
  assert.equal(r.phase,'playing');
  assert.equal(r.handValue,1);
  assert.deepEqual(r.poseOptions,[]);
  assert.equal(r.board.length,1);
  assert.equal(r.board[0].a,6);
  assert.equal(r.board[0].b,6);
  const holder=r.board[0].player;
  assert.equal(r.hands[holder].length,6);
  assert.equal(r.hands.flat().length,27);
  assert.equal(r.turn,(holder+1)%4);
  assert.equal(r.doubleSixPoseAfterBruck,false);
  assert.deepEqual(r.teamScores,[0,0]);
  return holder;
 }finally{clearTimeout(r.timer);}
}
test('normal and blocked brucks reset to zero and automatically pose double-six',()=>{
 for(const finish of [r=>finishWin(r,1),finishBlocked]){
  const r=room();finish(r);checkRestart(r);
 }
});
test('one-one still offers the winning partners their poser choice',()=>{
 const r=room();r.bruckStartCount=1;r.teamScores=[1,0];
 finishWin(r,1);nextHand(r);
 assert.deepEqual(r.teamScores,[1,1]);
 assert.equal(r.phase,'choose-poser');
 assert.deepEqual(r.poseOptions,[1,3]);
});
test('local bruck restart poses double-six from every seat without choosing a partner',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const deal=html.slice(html.indexOf('function dealHand('),html.indexOf('\nlet pendingPosePlayer=',html.indexOf('function dealHand(')));
 for(let holder=0;holder<4;holder++){
  const deck=Array.from({length:28},(_,id)=>({id,a:0,b:1}));deck[holder*7]={id:99,a:6,b:6};
  const ctx={deck,doubleSixPoseAfterBruck:true,pendingCountdownPoser:2,mode:'partner',lastWinnerTeam:0,handNo:4,
   playSequence:0,clearBlockedCounts(){},shuffle:d=>d,makeDeck:()=>deck,render(){},status(){},playerName:p=>`P${p+1}`,
   setTimeout(){},runTurn(){},choosePartnerPose(){throw Error('Bruck must bypass partner selection');}};
  vm.createContext(ctx);vm.runInContext(deal+'\ndealHand(false);',ctx);
  assert.equal(ctx.board[0].a,6);assert.equal(ctx.board[0].b,6);
  assert.equal(ctx.hands[holder].length,6);assert.equal(ctx.turn,(holder+1)%4);
  assert.equal(ctx.handValue,1);assert.equal(ctx.doubleSixPoseAfterBruck,false);assert.equal(ctx.pendingCountdownPoser,null);
 }
});
