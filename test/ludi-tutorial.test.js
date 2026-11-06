const test=require('node:test'),A=require('node:assert/strict'),E=require('../public/ludi/engine'),T=require('../public/ludi/tutorial');
test('guided practice uses legal real-engine entry, both dice, capture, barrier and exact finish scenarios',()=>{
 let g=T.scenario(0),draw=0;g=E.act(g,0,{type:'roll'},()=>[6,3][draw++]);A.equal(T.advance(0,g),0);
 g=E.act(g,0,{type:'move',piece:0,die:0});A.equal(T.advance(0,g),1);A.deepEqual(g.remaining,[1]);
 g=E.act(g,0,{type:'move',piece:0,die:1});A.equal(T.advance(1,g),2);
 g=T.scenario(2);A.ok(E.legal(g).some(m=>m.piece===0));g=E.act(g,0,{type:'move',piece:0,die:0});A.equal(g.last.captured.length,1);A.equal(T.advance(2,g),3);
 g=T.scenario(3);A.ok(!E.legal(g).some(m=>m.piece===0),'barrier must block the first piece');A.ok(E.legal(g).some(m=>m.piece===1));g=E.act(g,0,{type:'move',piece:1,die:0});A.equal(T.advance(3,g),4);
 g=T.scenario(4);A.ok(!E.legal(g,1).length,'three overshoots');g=E.act(g,0,{type:'move',piece:3,die:0});A.equal(g.phase,'over');A.equal(T.advance(4,g),5);
});
