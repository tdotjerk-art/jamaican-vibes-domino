const test=require('node:test');
const assert=require('node:assert/strict');
process.env.DATABASE_PATH=':memory:';
const {finishWin,finishBlocked}=require('../server');
function room(){return {matchId:'test',mode:'individual',target:6,scores:[5,0,0,0],teamScores:[0,0],
  handValue:2,handNo:2,players:[{name:'P1',seat:0},null,null,null],hands:[[{a:0,b:1}],[{a:3,b:4}],[{a:5,b:6}],[{a:4,b:6}]],
  board:[],history:[],spectators:new Map(),rematchVotes:new Set(),code:'TEST',timer:null};}
test('normal individual win caps a two-point hand at the target and keeps hands hidden',()=>{
  const r=room();finishWin(r,0);assert.equal(r.scores[0],6);assert.equal(r.phase,'match-over');assert.equal(r.revealHands,false);
});
test('blocked individual win ends a match at its target and reveals hands',()=>{
  const r=room();finishBlocked(r);assert.equal(r.scores[0],6);assert.equal(r.phase,'match-over');assert.equal(r.revealHands,true);
});
