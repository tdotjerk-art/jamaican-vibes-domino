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
test('exact ties are returned unresolved rather than awarding by seat or suit',()=>{
 const result=callResult([hand([11,11,6]),hand([11,6,11]),hand([2,7,9])],[0,1,2]);
 assert.equal(result.tied,true);assert.deepEqual(result.winners,[0,1]);assert.deepEqual(result.deltas,[0,0,0]);
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
