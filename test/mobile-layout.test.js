const test=require('node:test');
const assert=require('node:assert/strict');
const {layout}=require('../public/mobile-layout');

test('phone chain stays within the board without overlap for every opening position',()=>{
 for(const [width,height] of [[232,262],[294,336],[716,188]]){
  for(let openingId=0;openingId<28;openingId++){
   const board=Array.from({length:28},(_,id)=>({id,a:id%7,b:id%4===0?id%7:(id+1)%7}));
   board[openingId]={id:openingId,a:6,b:6};
   const {placed}=layout(board,openingId,width,height);
   assert.equal(placed.length,28);
   for(let i=0;i<placed.length;i++){
    const a=placed[i];
    assert.ok(a.x-a.w/2>=0&&a.x+a.w/2<=width+.001);
    assert.ok(a.y-a.h/2>=0&&a.y+a.h/2<=height+.001);
    for(const b of placed.slice(i+1))assert.ok(
     Math.abs(a.x-b.x)>=(a.w+b.w)/2-.01||Math.abs(a.y-b.y)>=(a.h+b.h)/2-.01,
     `opening ${openingId}: dominoes ${a.t.id} and ${b.t.id} overlap`);
   }
  }
 }
});

test('regular phone domino size stays fixed as an uneven chain grows',()=>{
 for(const [width,height] of [[294,336],[716,188]]){
  const board=Array.from({length:28},(_,id)=>({id,a:1,b:2}));board[0]={id:0,a:6,b:6};
  const first=layout(board.slice(0,1),0,width,height).long;
  for(let count=2;count<=28;count++)assert.equal(layout(board.slice(0,count),0,width,height).long,first);
 }
});
