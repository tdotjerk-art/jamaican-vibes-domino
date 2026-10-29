const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateCall,compareCalls,callResult,deck}=require('../public/three-cards-engine');
const hand=(ranks,suits=['♠','♥','♦'])=>ranks.map((rank,i)=>({rank,suit:suits[i],id:suits[i]+rank}));
test('special Jamaican category ranks threes above JJ6 above 66J',()=>{
 const calls=[hand([2,2,2]),hand([11,11,6]),hand([6,6,11])].map(evaluateCall);
 for(const call of calls){assert.equal(call.points,3);assert.equal(call.name,'Flush, straight and threes');}
 assert(compareCalls(calls[0],calls[1])>0);assert(compareCalls(calls[1],calls[2])>0);
 assert(compareCalls(evaluateCall(hand([9,9,9])),evaluateCall(hand([8,8,8])))>0);
 assert.equal(evaluateCall(hand([6,6,12])),null);
});
test('flush and straight outranks flush, which outranks straight',()=>{
 const calls=[hand([3,4,5],['♠','♠','♠']),hand([2,7,9],['♥','♥','♥']),hand([11,12,13])].map(evaluateCall);
 assert.deepEqual(calls.map(c=>c.points),[2,1,1]);
 assert(compareCalls(calls[0],calls[1])>0);assert(compareCalls(calls[1],calls[2])>0);
 assert(compareCalls(evaluateCall(hand([6,6,11])),calls[0])>0);
});
test('same categories compare ranks in order; suits do not break exact ties',()=>{
 const flush=ranks=>evaluateCall(hand(ranks,['♠','♠','♠']));
 assert(compareCalls(flush([14,9,3]),flush([13,12,10]))>0);
 assert(compareCalls(flush([14,9,3]),flush([14,8,7]))>0);
 assert(compareCalls(flush([14,9,4]),flush([14,9,3]))>0);
 assert.equal(compareCalls(flush([14,9,3]),evaluateCall(hand([3,14,9],['♥','♥','♥']))),0);
});
test('Ace straights accept both ends without wrapping',()=>{
 assert.equal(evaluateCall(hand([14,2,3])).name,'Straight');
 assert.equal(evaluateCall(hand([12,13,14])).name,'Straight');
 assert.equal(evaluateCall(hand([13,14,2])),null);
 assert(compareCalls(evaluateCall(hand([2,3,4])),evaluateCall(hand([14,2,3])))>0);
});
test('only strongest declared hand receives points from each opponent',()=>{
 const hands=[hand([11,6,6]),hand([11,11,6]),hand([2,2,2]),hand([4,8,13])];
 const before=JSON.stringify(hands),result=callResult(hands,[0,1,2]);
 assert.deepEqual(result.winners,[2]);assert.deepEqual(result.deltas,[-3,-3,9,-3]);assert.equal(result.tied,false);
 assert.equal(JSON.stringify(hands),before);
 assert.deepEqual(callResult(hands,[0,1]).deltas,[-3,9,-3,-3]);
 assert.deepEqual(callResult(hands,[]).deltas,[0,0,0,0]);
 assert.throws(()=>callResult(hands,[1,1]),/Invalid/);
});
test('exact tied winners share the non-winners payments',()=>{
 const result=callResult([hand([11,11,6]),hand([11,6,11]),hand([2,7,9])],[0,1,2]);
 assert.equal(result.tied,true);assert.deepEqual(result.winners,[0,1]);assert.deepEqual(result.deltas,[1.5,1.5,-3]);
});
test('all 22100 physical three-card hands classify independent of card order',()=>{
 const cards=deck();let count=0;
 for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++)for(let c=b+1;c<cards.length;c++){
  const cardsInHand=[cards[a],cards[b],cards[c]],call=evaluateCall(cardsInHand);
  assert.deepEqual(evaluateCall([...cardsInHand].reverse()),call);
  if(call)assert(call.points>=1&&call.points<=3);count++;
 }
 assert.equal(count,22100);
});

const {Game,scoreText}=require('../public/three-cards-engine');
function dealt(hands){const g=new Game(hands.map((_,i)=>'P'+i));g.dealer=0;g.phase='declare';g.players.forEach((p,i)=>p.hand=hands[i]);g.declarations=hands.map(()=>null);g.pile=[{id:'♣13',rank:13,suit:'♣'}];g.stock=[{id:'♣4',rank:4,suit:'♣'}];g.nextDrawer=2;return g;}
test('declarations block play, validate hands, conceal choices, and score exactly once',()=>{
 const g=dealt([hand([11,11,6]),hand([6,6,11]),hand([2,5,9]),hand([2,2,2])]);
 assert.equal(g.play(0,g.players[0].hand[0].id),false);assert.equal(g.draw(0),false);
 assert.equal(g.declare(2,true),false);assert.equal(g.declare(0,'true'),false);assert.equal(g.declare(-1,true),false);
 assert(g.declare(0,true));assert.equal(g.declare(0,true),false);
 assert.deepEqual(g.view(1).declarations,[true,null,null,null]);assert.equal(g.view(1).callSummary,null);
 assert(g.declare(1,true));assert(g.declare(2,false));assert(g.declare(3,true));
 assert.deepEqual(g.players.map(p=>p.score),[-3,-3,-3,9]);assert.deepEqual(g.callSummary.winners,[3]);
 const before=g.players.map(p=>p.score);assert.equal(g.declare(3,true),false);assert.deepEqual(g.players.map(p=>p.score),before);
 assert.equal(g.completed,0);assert.equal(g.dealer,0);assert.equal(g.phase,'draw');
 assert(g.draw(2));assert.equal(g.callSummary.name,'Flush, straight and threes');
});
test('calls remain separate from ordinary wins, bonuses, exhaustion, and future deals',()=>{
 const g=dealt([hand([11,11,6]),hand([6,6,11]),hand([2,5,9]),hand([2,2,2])]);
 g.players[0].score=4;for(let i=0;i<4;i++)g.declare(i,i===0);
 assert.deepEqual(g.players.map(p=>p.score),[13,-3,-3,-3]);
 g.finish(1);assert.deepEqual(g.players.map(p=>p.score),[12,0,-4,-4]);assert.equal(g.dealer,1);
 g.next();const beforeDeal=g.players.map(p=>p.score);g.deal(1);assert.notEqual(g.phase,'declare');assert(g.callSummary);assert.deepEqual(g.declarations,g.players.map(p=>!!evaluateCall(p.hand)));assert.deepEqual(g.players.map(p=>p.score),beforeDeal.map((score,i)=>score+(i===1?g.bonus:0)+g.callSummary.deltas[i]));
 const scores=g.players.map(p=>p.score);g.finish(null);assert.deepEqual(g.players.map(p=>p.score),scores);
 g.next();assert.equal(g.callSummary,null);assert.equal(g.declarations,null);
});
test('three-way sharing conserves points and fractional display survives ordinary hand scoring',()=>{
 const hands=[hand([2,3,4]),hand([2,3,4],['♥','♦','♣']),hand([2,3,4],['♦','♣','♠']),hand([6,8,12])];
 const result=callResult(hands,[0,1,2]);assert.deepEqual(result.deltas,[1/3,1/3,1/3,-1]);
 assert.equal(scoreText(1/3),'+⅓');assert.equal(scoreText(-4/3),'−1⅓');assert.equal(scoreText(1.5),'+1½');
 const g=dealt(hands);for(let i=0;i<4;i++)g.declare(i,i<3);g.finish(0);
 assert.equal(g.players[0].score,10/3);assert.equal(g.players[1].score,-2/3);
});

test('one- and two-point calls transfer their value per opponent; all-player ties transfer nothing',()=>{
 const ordinary=[hand([2,5,9]),hand([3,7,12]),hand([4,8,13])];
 assert.deepEqual(callResult([hand([3,4,5]),...ordinary],[0]).deltas,[3,-1,-1,-1]);
 assert.deepEqual(callResult([hand([3,4,5],['♠','♠','♠']),...ordinary],[0]).deltas,[6,-2,-2,-2]);
 const equal=[['♠','♠','♠'],['♥','♥','♥'],['♦','♦','♦'],['♣','♣','♣']].map(suits=>hand([2,7,9],suits));
 assert.deepEqual(callResult(equal,[0,1,2,3]).deltas,[0,0,0,0]);
});

 test('only the highest call is exposed in summaries and every online view',()=>{
 const cases=[
  [hand([3,4,5]),hand([8,9,10]),hand([2,5,9])],
  [hand([8,9,10]),hand([2,7,9],['♥','♥','♥']),hand([2,5,9])],
  [hand([2,7,9],['♥','♥','♥']),hand([3,4,5],['♠','♠','♠']),hand([2,5,9])],
  [hand([3,4,5],['♠','♠','♠']),hand([2,2,2]),hand([2,5,9])],
  [hand([2,7,9],['♥','♥','♥']),hand([3,8,10],['♠','♠','♠']),hand([2,5,9])]
 ];
 for(const hands of cases){const g=dealt(hands);hands.forEach((h,i)=>g.declare(i,!!evaluateCall(h)));
 assert.deepEqual(g.callSummary.winners,[1]);assert.deepEqual(g.callSummary.calls.map(c=>!!c),[false,true,false]);
 for(let seat=0;seat<hands.length;seat++){assert.deepEqual(g.view(seat).callSummary.calls.map(c=>!!c),[false,true,false]);}
 g.finish(null);assert.deepEqual(g.view(0).callSummary.hands.map(h=>h.seat),[1]);
 }
 });
