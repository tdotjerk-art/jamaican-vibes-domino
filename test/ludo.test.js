const test=require('node:test'),A=require('node:assert/strict'),E=require('../public/ludo/engine');
const fresh=(n=4)=>E.fresh(Array.from({length:n},(_,i)=>'P'+i));
const roll=(g,first,second)=>{let next=0;return E.act(g,g.turn,{type:'roll'},()=>[first,second][next++]);};
const move=(g,piece,die)=>E.act(g,g.turn,{type:'move',piece,die});
test('Ludo uses 48 unique adjoining track squares and opposite corners for two players',()=>{
 A.equal(E.TRACK.length,48);A.equal(new Set(E.TRACK.map(p=>p.join(','))).size,48);
 for(let i=0;i<48;i++){const a=E.TRACK[i],b=E.TRACK[(i+1)%48];A.ok(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1);}
 for(const n of [2,3,4]){const g=fresh(n);A.equal(g.players.length,n);A.deepEqual(g.players[1].tokens,[-1,-1,-1,-1]);}
 A.deepEqual(fresh(2).players.map(p=>p.color),[0,2]);
 for(const n of [1,5])A.throws(()=>fresh(n));
 for(let color=0;color<4;color++){for(let progress=0;progress<E.HOME;progress++){const pos=E.coordinate({color},progress);A.ok(pos.every(n=>n>=0&&n<13));}A.equal(E.ring({color},E.OUTER_LAST+1),null);}
});
test('a six enters a piece and the other die moves it before the bonus roll',()=>{
 let g=fresh();g=roll(g,3,2);A.equal(g.turn,1);A.equal(g.phase,'roll');A.deepEqual(g.dice,[3,2]);
 g=fresh();A.throws(()=>move(g,0,0),/Roll/);A.throws(()=>E.act(g,1,{type:'roll'}),/turn/);
 g=roll(g,6,2);A.equal(E.legal(g).length,4);A.throws(()=>roll(g,6,2),/remaining/);A.throws(()=>move(g,9,0),/unused die/);
 g=move(g,0,0);A.equal(g.players[0].tokens[0],0);A.equal(g.turn,0);A.equal(g.phase,'move');A.deepEqual(g.remaining,[1]);
 g=move(g,0,1);A.equal(g.players[0].tokens[0],2);A.equal(g.turn,0);A.equal(g.phase,'roll');A.deepEqual(g.remaining,[]);
});
test('dice can be used in either order, on one piece or split, and neither can be reused',()=>{
 let g=fresh();g.players[0].tokens=[0,10,-1,-1];g=roll(g,3,4);
 A.throws(()=>E.act(g,0,{type:'move',piece:0}),/which die/);
 g=move(g,0,1);A.equal(g.players[0].tokens[0],4);A.deepEqual(g.remaining,[0]);A.throws(()=>move(g,0,1),/unused die/);A.throws(()=>roll(g,1,1),/remaining/);
 g=move(g,1,0);A.equal(g.players[0].tokens[1],13);A.equal(g.turn,1);A.equal(g.phase,'roll');
 g=fresh();g=move(move(roll(g,6,6),0,0),1,1);A.deepEqual(g.players[0].tokens,[0,0,-1,-1]);A.equal(g.turn,0);A.equal(g.phase,'roll');
});
test('captures return opponents to the yard and give a bonus only after the other die is used',()=>{
 let g=fresh();g.players[0].tokens[0]=0;g.players[1].tokens[0]=37;
 g=move(roll(g,1,2),0,0);A.equal(g.players[1].tokens[0],-1);A.equal(g.last.captured.length,1);A.equal(g.phase,'move');A.equal(g.turn,0);
 g=move(g,0,1);A.equal(g.phase,'roll');A.equal(g.turn,0);
 g=fresh();g.players[0].tokens[0]=9;g.players[1].tokens[0]=46;
 g=move(roll(g,1,1),0,0);A.equal(g.players[1].tokens[0],46);A.equal(g.last.captured.length,0);g=move(g,0,1);A.equal(g.turn,1);
});
test('enemy blockades cannot be crossed or landed on; a third own piece cannot stack',()=>{
 for(const die of [1,2,6]){let g=fresh();g.players[0].tokens[0]=0;g.players[1].tokens=[37,37,-1,-1];g=roll(g,die,die);A.ok(!E.legal(g).some(m=>m.piece===0));}
 let g=fresh();g.players[0].tokens=[0,1,1,-1];g=roll(g,1,1);A.ok(!E.legal(g).some(m=>m.piece===0));A.ok(E.legal(g).some(m=>m.piece===1));
 g=fresh();g.players[0].tokens=[0,1,1,-1];g=move(roll(g,2,2),0,0);A.equal(g.players[0].tokens[0],2);
});
test('every home lane requires exact rolls and finishing the fourth piece discards the other die',()=>{
 for(let color=0;color<4;color++){
  let g=fresh();g.turn=color;g.players[color].tokens=[E.HOME-1,E.HOME,E.HOME,E.HOME];
  const original=JSON.stringify(g),noMove=roll(g,2,3);A.equal(noMove.phase,'roll');A.equal(noMove.turn,(color+1)%4);A.equal(JSON.stringify(g),original);
  g=move(roll(g,1,4),0,0);A.equal(g.phase,'over');A.equal(g.winner,color);A.deepEqual(g.remaining,[]);A.deepEqual(g.players[color].tokens,[E.HOME,E.HOME,E.HOME,E.HOME]);A.throws(()=>roll(g,6,6),/finished/);
 }
});
test('unusable dice are skipped, but a die that becomes usable after entry is retained',()=>{
 let g=fresh();g.players[0].tokens=[E.HOME-2,E.HOME,E.HOME,E.HOME];g=move(roll(g,1,6),0,0);A.equal(g.phase,'roll');A.deepEqual(g.remaining,[]);A.equal(g.turn,0);
 g=fresh();g=roll(g,2,6);A.equal(E.legal(g,0).length,0);g=move(g,0,1);A.equal(E.legal(g,0).length,1);A.equal(g.phase,'move');g=move(g,0,0);A.equal(g.players[0].tokens[0],2);
});
test('three consecutive rolls containing a six forfeit the third pair before moving',()=>{
 let g=fresh();for(let n=0;n<2;n++)g=move(move(roll(g,6,1),0,0),0,1);
 const tokens=g.players[0].tokens.slice();g=roll(g,1,6);A.equal(g.turn,1);A.equal(g.phase,'roll');A.equal(g.sixes,0);A.deepEqual(g.remaining,[]);A.deepEqual(g.players[0].tokens,tokens);
 g=fresh();g.players[0].tokens[0]=0;g.players[1].tokens[0]=37;g.sixes=2;g=move(move(roll(g,1,2),0,0),0,1);A.equal(g.sixes,0);A.equal(g.turn,0);
});
test('both dice are independently validated and every possible pair has consistent legal choices',()=>{
 for(let first=1;first<=6;first++)for(let second=1;second<=6;second++){
  const g=roll(fresh(),first,second);A.deepEqual(g.dice,[first,second]);A.equal(g.rollNo,1);
  if(first===6||second===6){A.equal(g.phase,'move');A.equal(E.legal(g).length,(Number(first===6)+Number(second===6))*4);}
  else{A.equal(g.turn,1);A.equal(g.phase,'roll');}
 }
 const g=fresh(),original=JSON.stringify(g);A.throws(()=>roll(g,3,9),/Invalid dice/);A.equal(JSON.stringify(g),original);
});
test('seeded full two-dice games finish and conserve every piece within the board',()=>{
 for(const n of [2,3,4]){
  let seed=n,g=fresh(n),steps=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  while(g.phase!=='over'&&steps++<12000){
   if(g.phase==='roll')g=E.act(g,g.turn,{type:'roll'},()=>Math.floor(random()*6)+1);
   else{const moves=E.legal(g);A.ok(moves.length);const m=moves[Math.floor(random()*moves.length)];g=move(g,m.piece,m.die);}
   A.equal(g.players.flatMap(p=>p.tokens).length,n*4);A.ok(g.players.every(p=>p.tokens.every(n=>Number.isInteger(n)&&n>=-1&&n<=E.HOME)));A.equal(new Set(g.remaining).size,g.remaining.length);
  }
  A.equal(g.phase,'over','a complete '+n+'-player game must finish');A.ok(g.players[g.winner].tokens.every(n=>n===E.HOME));
 }
});
