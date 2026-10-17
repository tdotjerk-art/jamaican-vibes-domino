const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {nextHand,choosePoser,makeDeck}=require('../server');

function room(team){return {
 code:'POSE',mode:'partner',players:Array.from({length:4},(_,seat)=>({seat,name:`P${seat+1}`,connected:true})),
 spectators:new Map(),rematchVotes:new Set(),history:[],hands:[[],[],[],[]],board:[{a:1,b:2}],handNo:2,
 scores:[0,0,0,0],teamScores:team===0?[2,0]:[0,2],nextPlayFor:1,lastWinnerTeam:team,phase:'hand-over'
};}
test('online winning partners choose after a complete deal and keep those same hands',()=>{
 for(const team of [0,1])for(const seat of [team,team+2]){
  const r=room(team);nextHand(r);
  assert.equal(r.phase,'choose-poser');assert.equal(r.handNo,3);
  assert.deepEqual(r.hands.map(h=>h.length),[7,7,7,7]);
  assert.equal(new Set(r.hands.flat().map(t=>t.id)).size,28);
  assert.deepEqual(r.board,[]);assert.deepEqual(r.poseOptions,[team,team+2]);
  assert.equal(r.turn,null);assert.equal(r.deadline,0);assert.ok(!r.timer);
  const dealt=JSON.stringify(r.hands);
  choosePoser(r,1-team);assert.equal(r.phase,'choose-poser');
  nextHand(r);assert.equal(JSON.stringify(r.hands),dealt);
  choosePoser(r,seat);
  try{
   assert.equal(r.phase,'playing');assert.equal(r.turn,seat);assert.equal(r.handNo,3);
   assert.equal(JSON.stringify(r.hands),dealt);assert.deepEqual(r.board,[]);
   assert.ok(r.deadline>Date.now());assert.deepEqual(r.poseOptions,[]);
   choosePoser(r,team);assert.equal(r.turn,seat);
  }finally{clearTimeout(r.timer);}
 }
});
test('local partners see the newly dealt hand before the poser decision',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const deal=html.slice(html.indexOf('function dealHand('),html.indexOf('\nlet pendingPosePlayer=',html.indexOf('function dealHand(')));
 for(const team of [0,1]){
  let rendered=false,chosen=false;
  const ctx={mode:'partner',lastWinnerTeam:team,handNo:2,playSequence:0,tiedCarry:false,doubleSixPoseAfterBruck:false,pendingCountdownPoser:2,
   clearBlockedCounts(){},shuffle:d=>d,makeDeck,render(){rendered=true;},
   choosePartnerPose(t){
    chosen=true;assert.equal(t,team);assert.equal(rendered,true);
    assert.deepEqual(Array.from(ctx.hands,h=>h.length),[7,7,7,7]);
    assert.equal(ctx.turn,null);assert.equal(ctx.board.length,0);assert.equal(ctx.handNo,3);
   }};
  vm.createContext(ctx);vm.runInContext(deal+'\ndealHand(false);',ctx);assert.equal(chosen,true);
 }
 assert.doesNotMatch(html,/preparePartnerPoserChoice|setCountdownPoser\(/);
});
