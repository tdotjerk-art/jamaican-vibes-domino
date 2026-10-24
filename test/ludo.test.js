const test=require('node:test'),A=require('node:assert/strict'),E=require('../public/ludo/engine');
const fresh=(n=4)=>E.fresh(Array.from({length:n},(_,i)=>'P'+i));
const roll=(g,die)=>E.act(g,g.turn,{type:'roll'},()=>die);
const move=(g,piece)=>E.act(g,g.turn,{type:'move',piece});
test('Ludo uses 48 unique adjoining track squares and opposite corners for two players',()=>{
 A.equal(E.TRACK.length,48);A.equal(new Set(E.TRACK.map(p=>p.join(','))).size,48);
 for(let i=0;i<48;i++){const a=E.TRACK[i],b=E.TRACK[(i+1)%48];A.ok(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1);}
 for(const n of [2,3,4]){const g=fresh(n);A.equal(g.players.length,n);A.deepEqual(g.players[1].tokens,[-1,-1,-1,-1]);}
 A.deepEqual(fresh(2).players.map(p=>p.color),[0,2]);
 for(const n of [1,5])A.throws(()=>fresh(n));
 for(let color=0;color<4;color++){for(let progress=0;progress<E.HOME;progress++){const pos=E.coordinate({color},progress);A.ok(pos.every(n=>n>=0&&n<13));}A.equal(E.ring({color},E.OUTER_LAST+1),null);}
});
test('six enters a piece, legal moves are enforced, and an unavailable roll passes automatically',()=>{
 let g=fresh();const untouched=JSON.stringify(g);g=roll(g,3);A.equal(g.turn,1);A.equal(g.phase,'roll');A.equal(g.die,3);A.equal(JSON.stringify(fresh()),untouched);
 g=fresh();A.throws(()=>move(g,0),/Roll/);A.throws(()=>E.act(g,1,{type:'roll'}),/turn/);
 g=roll(g,6);A.equal(E.legal(g).length,4);A.throws(()=>roll(g,6),/Choose/);A.throws(()=>move(g,9),/available/);
 g=move(g,0);A.equal(g.players[0].tokens[0],0);A.equal(g.turn,0);A.equal(g.phase,'roll');
 g=move(roll(g,2),0);A.equal(g.players[0].tokens[0],2);A.equal(g.turn,1);
});
test('captures return opponents to the yard and award a roll; safe squares cannot be captured',()=>{
 let g=fresh();g.players[0].tokens[0]=0;g.players[1].tokens[0]=37; // ring 2, one square after Kingston's start
 g=move(roll(g,1),0);A.equal(g.players[1].tokens[0],-1);A.equal(g.last.captured.length,1);A.equal(g.turn,0);A.equal(g.phase,'roll');
 g=fresh();g.players[0].tokens[0]=9;g.players[1].tokens[0]=46; // safe ring 11, top outer bar
 g=move(roll(g,1),0);A.equal(g.players[1].tokens[0],46);A.equal(g.last.captured.length,0);A.equal(g.turn,1);
});
test('enemy blockades cannot be crossed or landed on; a third own piece cannot stack',()=>{
 for(const die of [1,2,6]){let g=fresh();g.players[0].tokens[0]=0;g.players[1].tokens=[37,37,-1,-1];g=roll(g,die);A.ok(!E.legal(g).some(m=>m.piece===0));}
 let g=fresh();g.players[0].tokens=[0,1,1,-1];g=roll(g,1);A.ok(!E.legal(g).some(m=>m.piece===0));A.ok(E.legal(g).some(m=>m.piece===1));
 g=fresh();g.players[0].tokens=[0,1,1,-1];g=move(roll(g,2),0);A.equal(g.players[0].tokens[0],2);
});
test('every home lane requires exact rolls and the fourth finished piece wins',()=>{
 for(let color=0;color<4;color++){
  let g=fresh();g.turn=color;g.players[color].tokens=[E.HOME-1,E.HOME,E.HOME,E.HOME];
  const original=JSON.stringify(g);const noMove=roll(g,2);A.equal(noMove.phase,'roll');A.equal(noMove.turn,(color+1)%4);A.equal(JSON.stringify(g),original);
  g=move(roll(g,1),0);A.equal(g.phase,'over');A.equal(g.winner,color);A.deepEqual(g.players[color].tokens,[E.HOME,E.HOME,E.HOME,E.HOME]);A.throws(()=>roll(g,6),/finished/);
 }
});
test('three consecutive sixes forfeit the third move and capture bonus rolls reset the streak',()=>{
 let g=fresh();g=move(roll(g,6),0);g=move(roll(g,6),0);const tokens=g.players[0].tokens.slice();g=roll(g,6);A.equal(g.turn,1);A.equal(g.phase,'roll');A.equal(g.sixes,0);A.deepEqual(g.players[0].tokens,tokens);
 g=fresh();g.players[0].tokens[0]=0;g.players[1].tokens[0]=37;g.sixes=2;g=move(roll(g,1),0);A.equal(g.sixes,0);A.equal(g.turn,0);
});
test('seeded full games finish, conserve all sixteen pieces, and never escape the board',()=>{
 for(const n of [2,3,4]){
  let seed=n,g=fresh(n),steps=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  while(g.phase!=='over'&&steps++<12000){
   if(g.phase==='roll')g=E.act(g,g.turn,{type:'roll'},()=>Math.floor(random()*6)+1);
   else{const moves=E.legal(g);A.ok(moves.length);g=move(g,moves[Math.floor(random()*moves.length)].piece);}
   A.equal(g.players.flatMap(p=>p.tokens).length,n*4);A.ok(g.players.every(p=>p.tokens.every(n=>Number.isInteger(n)&&n>=-1&&n<=E.HOME)));
  }
  A.equal(g.phase,'over','a complete '+n+'-player game must finish');A.ok(g.players[g.winner].tokens.every(n=>n===E.HOME));
 }
});
