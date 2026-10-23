const test=require('node:test'),assert=require('node:assert/strict');
const {finishWin,finishBlocked,nextHand,canPlay}=require('../server');
function room(){return {code:'SIX',mode:'individual',target:6,players:Array.from({length:4},(_,seat)=>({seat,name:'P'+(seat+1),connected:true})),spectators:new Map(),rematchVotes:new Set(),history:[],hands:[[],[],[],[]],board:[],handNo:1,handValue:1,scores:[0,0,0,0],teamScores:[0,0],phase:'playing',lastWinnerTeam:null};}
test('individual wins accumulate independently without a bruck reset, one point per win',()=>{
 const r=room();for(const winner of [0,1,1,2]){r.phase='playing';finishWin(r,winner);}
 assert.deepEqual(r.scores,[1,2,1,0]);assert.equal(r.phase,'hand-over');
 nextHand(r);try{assert.equal(r.phase,'playing');assert.equal(r.turn,2);assert.equal(r.handValue,1);assert.deepEqual(r.poseOptions,[]);}finally{clearTimeout(r.timer);}
 for(let n=0;n<5;n++){r.phase='playing';finishWin(r,0);}
 assert.deepEqual(r.scores,[6,2,1,0]);assert.equal(r.phase,'match-over');
 nextHand(r);assert.equal(r.phase,'match-over');
});
test('a blocked individual win ends immediately at six and leaves other scores intact',()=>{
 const r=room();r.scores=[1,2,1,5];r.hands=[[{a:1,b:1}],[{a:2,b:2}],[{a:3,b:3}],[{a:0,b:0}]];
 finishBlocked(r);assert.deepEqual(r.scores,[1,2,1,6]);assert.equal(r.phase,'match-over');assert.equal(r.turn,null);
});
test('an individual blocked tie preserves all scores and the next win is still worth one',()=>{
 const r=room();r.tieRule='last-winner-one';r.lastIndividualWinner=2;r.scores=[1,2,1,0];r.hands=[[{a:0,b:0}],[{a:0,b:0}],[{a:3,b:3}],[{a:4,b:4}]];
 finishBlocked(r);assert.deepEqual(r.scores,[1,2,1,0]);nextHand(r);
 try{assert.equal(r.handValue,1);finishWin(r,1);assert.deepEqual(r.scores,[1,3,1,0]);}finally{clearTimeout(r.timer);}
});

test('play-for-two tied block automatically poses double-six and awards two without resetting scores',()=>{
 const r=room();r.tieRule='double-six-two';r.lastIndividualWinner=2;r.scores=[1,2,1,0];r.hands=[[{a:0,b:0}],[{a:0,b:0}],[{a:3,b:3}],[{a:4,b:4}]];
 finishBlocked(r);assert.deepEqual(r.scores,[1,2,1,0]);nextHand(r);
 try{assert.equal(r.handValue,2);assert.equal(r.board.length,1);assert.equal(r.board[0].a,6);assert.equal(r.board[0].b,6);assert.ok(r.hands[r.turn].some(t=>canPlay(r.board,t)));finishWin(r,1);assert.deepEqual(r.scores,[1,4,1,0]);}finally{clearTimeout(r.timer);}
});
test('play-for-one tied block lets the last winner pose without playing double-six automatically',()=>{
 const r=room();r.tieRule='last-winner-one';r.lastIndividualWinner=3;r.scores=[1,2,1,0];r.hands=[[{a:0,b:0}],[{a:0,b:0}],[{a:3,b:3}],[{a:4,b:4}]];
 finishBlocked(r);nextHand(r);
 try{assert.equal(r.handValue,1);assert.deepEqual(r.board,[]);assert.equal(r.turn,3);finishWin(r,0);assert.deepEqual(r.scores,[2,2,1,0]);}finally{clearTimeout(r.timer);}
});
test('a two-point hand won from five ends at six and does not display seven',()=>{
 const r=room();r.scores=[5,2,1,0];r.handValue=2;finishWin(r,0);assert.deepEqual(r.scores,[6,2,1,0]);assert.equal(r.phase,'match-over');
});
