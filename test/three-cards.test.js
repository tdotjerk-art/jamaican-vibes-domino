const test=require('node:test'),assert=require('node:assert/strict');
const {Game,deck}=require('../public/three-cards-engine');
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const c=(rank,suit='♠')=>({id:suit+rank,rank,suit});
test('a dealer repick clears old picks before showing cards from the reshuffled deck',()=>{
 const g=new Game(['A','B','C']);g.pickDeck=[c(14,'♥'),c(14),c(2,'♦')];
 g.pick(0);g.pick(1);g.pick(2);assert.deepEqual(g.pickSeats,[1,2]);
 // A card from the previous draw may legitimately be drawn from the fresh pack.
 g.pickDeck=[c(3),c(2,'♦')];g.pick(1);
 const shown=g.view(0).picks.filter(Boolean);assert.equal(new Set(shown.map(c=>c.id)).size,shown.length);
 assert.equal(g.picks[0],null);
});
function fixture(hands,top=c(7),drawer=2){const g=new Game(hands.map((_,i)=>'P'+i));g.dealer=0;g.players.forEach((p,i)=>p.hand=hands[i]);g.stock=[c(2,'♦'),c(4,'♦')];g.pile=[top];g.nextDrawer=drawer;g.offer(1);return g;}
test('regular 52-card pack and highest card selects dealer; ties repick',()=>{
 const d=deck();assert.equal(d.length,52);assert.equal(new Set(d.map(c=>c.id)).size,52);
 const g=new Game(['A','B','C']);g.pickDeck=[c(8),c(14),c(3)];g.pick(0);g.pick(1);g.pick(2);assert.equal(g.dealer,1);assert.equal(g.phase,'deal');
 g.beginPicker();g.pickDeck=[c(14,'♥'),c(14),c(3)];g.pick(0);g.pick(1);g.pick(2);assert.equal(g.phase,'pick');assert.deepEqual(g.pickSeats,[1,2]);assert.equal(g.pick(0),false);
});
test('dealer bonus is one point per opponent for a six or jack, not other cards',()=>{
 for(const rank of [6,11,7]){const g=new Game(['A','B','C'],5,seeded(123));g.phase='deal';g.dealer=0;
  // Deterministic deals exercise the bonus separately from automatic call transfers.
  let found=false;for(let tries=0;tries<2000;tries++){g.players.forEach(p=>p.score=0);g.phase='deal';g.deal(0);if(g.opening.rank===rank){found=true;const bonus=rank===7?0:2;assert.equal(g.bonus,bonus);assert.equal(g.players[0].score,bonus+g.callSummary.deltas[0]);assert.equal(g.players.reduce((n,p)=>n+p.score,0),bonus);assert.equal(g.players.reduce((n,p)=>n+p.hand.length,0),9);break;}}
  assert(found);
 }
});
test('matching a rank requires a companion, leaves one card, and passes choice to the right',()=>{
 const g=fixture([[c(2),c(3),c(4)],[c(7,'♥'),c(13),c(9)],[c(13,'♦'),c(5),c(6)]]);
 assert.equal(g.turn,1);assert.equal(g.play(1,'♥7',undefined),false);assert.equal(g.play(2,'♦13','♠5'),false);
 assert(g.play(1,'♥7','♠13'));assert.equal(g.players[1].hand.length,1);assert.equal(g.players[1].hand[0].rank,9);assert.equal(g.pile[0].rank,7);assert.equal(g.pile.at(-1).rank,13);assert.equal(g.turn,2);
 assert(g.play(2,'♦13','♠5'));assert.equal(g.players[2].hand.length,1);
});
test('draw stays on table; drawer has first option and can decline to the next matching player',()=>{
 const g=fixture([[c(4)],[c(4,'♥')],[c(8)]]);assert.equal(g.phase,'draw');assert.equal(g.turn,2);g.stock=[c(4,'♦')];assert(g.draw(2));assert.equal(g.turn,0);assert.equal(g.players[2].hand.length,1);assert(g.pass(0));assert.equal(g.turn,1);assert(g.play(1,'♥4'));assert.equal(g.winner,1);assert.deepEqual(g.players.map(p=>p.score),[-1,2,-1]);assert.equal(g.dealer,1);assert.equal(g.completed,1);assert.equal(g.phase,'hand-over');
});
test('nobody using opening leads to second person after dealer, then drawing rotates right',()=>{
 const g=fixture([[c(8)],[c(9)],[c(10)]]);assert.equal(g.turn,2);g.stock=[c(5),c(2),c(3)];g.draw(2);assert.equal(g.turn,0);g.draw(0);assert.equal(g.turn,1);
});
test('exhaustion keeps bonus, counts the game, and requires a new dealer pick',()=>{
 const g=fixture([[c(8)],[c(9)],[c(10)]]);g.players[0].score=3;g.stock=[c(2)];g.draw(2);assert.equal(g.winner,null);assert.equal(g.completed,1);assert.deepEqual(g.players.map(p=>p.score),[3,0,0]);g.next();assert.equal(g.phase,'pick');assert.equal(g.pickSeats.length,3);
});
test('dealer loss deducts one after bonus; dealer win earns one per opponent',()=>{
 for(const winner of [0,1]){const g=fixture([[c(7)],[c(7,'♥')],[c(10)]]);g.players[0].score=3;g.queue=[winner];g.turn=winner;g.play(winner,g.players[winner].hand[0].id);assert.equal(g.players[0].score,winner===0?5:2);}
});
test('session stops at agreed count, can extend by multiples of five without resetting scores',()=>{
 const g=fixture([[c(8)],[c(7,'♥')],[c(10)]]);g.completed=4;g.play(1,'♥7');assert.equal(g.phase,'session-over');const before=g.players.map(p=>p.score);assert.equal(g.next(),false);assert.equal(g.extend(3),false);assert(g.extend(10));assert.equal(g.total,15);assert.deepEqual(g.players.map(p=>p.score),before);assert.equal(g.phase,'deal');
});
test('view excludes other hands, deck, choice queue and dealer-pick deck',()=>{const g=fixture([[c(8)],[c(7,'♥')],[c(10)]]),v=g.view(0);assert.equal(v.players[0].hand.length,1);assert.deepEqual(v.players[1].hand,[]);for(const key of ['stock','queue','pickDeck'])assert.equal(v[key],undefined);});
test('many complete hands preserve cards and apply only specified points',()=>{
 for(let n=2;n<=4;n++){const g=new Game(Array.from({length:n},(_,i)=>'P'+i),5);let actions=0;
  while(g.phase!=='session-over'&&actions++<5000){
   if(g.phase==='pick'){const seat=g.pickSeats.find(i=>!g.picks[i]);g.pick(seat);}
   else if(g.phase==='deal')g.deal(g.dealer);
   else if(g.phase==='declare'){const seat=g.declarations.findIndex(value=>value===null);g.declare(seat,false);}
   else if(g.phase==='draw')g.draw(g.turn);
   else if(g.phase==='offer'){const h=g.players[g.turn].hand,m=h.find(c=>c.rank===g.pile.at(-1).rank),o=h.find(c=>c!==m);g.play(g.turn,m.id,o?.id);}
   else if(g.phase==='hand-over')g.next();
   if(g.stock){const all=[...g.stock,...g.pile,...g.players.flatMap(p=>p.hand)];assert.equal(all.length,52);assert.equal(new Set(all.map(c=>c.id)).size,52);}
  }
  assert.equal(g.phase,'session-over');assert.equal(g.completed,5);assert(actions<5000);
 }
});

test('tables accept four players and reject a fifth',()=>{assert.equal(new Game(['A','B','C','D']).players.length,4);assert.throws(()=>new Game(['A','B','C','D','E']),/2–4/);});

test('two twos and a king win using a king when priority reaches that player',()=>{
 const g=fixture([[c(8)],[c(2),c(2,'♥'),c(13)],[c(9)]],c(13,'♦'));
 assert.equal(g.turn,1);assert(g.play(1,'♠13'));assert.equal(g.winner,1);assert.deepEqual(g.players[1].hand,[]);assert.deepEqual(g.pile.slice(-3).map(c=>c.rank),[2,2,13]);assert.equal(g.view(0).players[1].count,0);assert.deepEqual(g.players.map(p=>p.score),[-1,2,-1]);assert.equal(g.dealer,1);
});
test('pair win works on own draw and after another player declines in rotation',()=>{
 for(const drawer of [0,1]){const g=fixture([[c(2),c(2,'♥'),c(13)],[c(13,'♥'),c(8),c(9)],[c(10)]],c(7),drawer);g.stock=[c(13,'♦')];assert(g.draw(drawer));if(drawer===1){assert.equal(g.play(0,'♠13'),false);assert.equal(g.turn,1);assert(g.pass(1));}assert.equal(g.turn,0);g.players[0].score=3;assert(g.play(0,'♠13'));assert.equal(g.winner,0);assert.equal(g.players[0].score,5);assert.equal(g.players[0].hand.length,0);}
});
test('a pair rank or three of a kind does not trigger the singleton winning rule',()=>{
 const {pairWin}=require('../public/three-cards-engine');assert.equal(pairWin([c(2),c(2,'♥'),c(13)],2),false);assert.equal(pairWin([c(2),c(2,'♥'),c(2,'♦')],2),false);assert.equal(pairWin([c(2),c(3),c(13)],13),false);
 const g=fixture([[c(8)],[c(2),c(2,'♥'),c(13)],[c(9)]],c(2,'♦'));assert.equal(g.play(1,'♠2'),false);assert.equal(g.play(1,'♠2','♠13'),false);assert.equal(g.phase,'draw');assert.equal(g.winner??null,null);assert.equal(g.players[1].hand.length,3);assert(g.draw(2));g.pile.push(c(13,'♣'));g.offer(1);assert.equal(g.turn,1);assert(g.play(1,'♠13'));assert.equal(g.players[1].hand.length,0);
});
