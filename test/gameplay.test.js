const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const {
  turnSeconds,
  makeDeck,
  ends,
  canPlay,
  orientLeft,
  orientRight
}=require('../server');

test('a double-six deck has 28 unique dominoes',()=>{
  const deck=makeDeck();
  assert.equal(deck.length,28);
  assert.equal(new Set(deck.map(d=>`${d.a}-${d.b}`)).size,28);
});

test('approved timers are 20 seconds for 4-7 and 30 seconds for 1-3',()=>{
  for(const count of [4,5,6,7])assert.equal(turnSeconds(count),20);
  for(const count of [1,2,3])assert.equal(turnSeconds(count),30);
});

test('legal move detection checks both open ends',()=>{
  const board=[{a:2,b:4},{a:4,b:6}];
  assert.deepEqual(ends(board),[2,6]);
  assert.equal(canPlay(board,{a:0,b:2}),true);
  assert.equal(canPlay(board,{a:6,b:6}),true);
  assert.equal(canPlay(board,{a:3,b:5}),false);
});

test('orientation preserves the matching value at the connected end',()=>{
  assert.deepEqual(orientLeft({a:2,b:5,id:1},2),{a:5,b:2,faceA:5,faceB:2,id:1});
  assert.deepEqual(orientRight({a:2,b:5,id:1},5),{a:5,b:2,faceA:5,faceB:2,id:1});
});

test('client keeps instant play, hidden inactive timers, and symmetric corners',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/\.player-timer\{\s*display:none !important;/);
  assert.match(html,/\.player-timer\.active\{\s*display:flex !important;/);
  assert.match(html,/cornerCount=1;/);
  assert.doesNotMatch(html,/cornerCount=\(side==='left'\)/);
  assert.doesNotMatch(html,/First click only SELECTS the domino/);
  assert.match(html,/return count>=1 && count<=3 \? 30 : 20;/);
  assert.match(html,/sock\.emit\('reconnect-player',\{roomCode,token:myToken\}\)/);
});
