const {test}=require('node:test'),A=require('node:assert/strict'),express=require('express');
const {createDraffRouter}=require('../draff-online');
test('Draff rooms support two seats, authenticated actions, reconnect and revision checks',async()=>{
 const app=express();app.use('/api/draff',createDraffRouter());let server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let origin='http://127.0.0.1:'+server.address().port;
 const call=async(a,r)=>{let res=await fetch(origin+'/api/draff'+(a?'':'?code='+r.code),{method:a?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(r?.token?{Authorization:'Bearer '+r.token}:{})},...(a?{body:JSON.stringify({...a,...(r?{code:r.code,version:r.version}:{})})}:{})});return {status:res.status,data:await res.json()}};
 try{
 for(const name of [undefined,'  ',null,{},['Junior']]){const invalid=await call({type:'create',name});A.equal(invalid.status,400);A.match(invalid.data.error,/name/);}
 let x=await call({type:'create',name:'  Junior  '});A.equal(x.status,200);let host=x.data;A.equal(host.you,1);A.deepEqual(host.players,{gold:'Junior',black:null});A.equal(host.state.active,false);A.equal(host.state.pending,undefined);A.equal((await call({type:'move',from:40,to:33},host)).status,400);
 A.equal((await call({type:'join',code:host.code,name:' '})).status,400);
 x=await call({type:'join',code:host.code,name:'Andre'});A.equal(x.status,200);let guest=x.data;A.equal(guest.you,-1);A.deepEqual(guest.players,{gold:'Junior',black:'Andre'});A.equal((await call({type:'join',code:host.code,name:'Andre'})).status,409);A.equal((await call(null,{code:host.code,token:'a'.repeat(64)})).status,403);
 host={...host,...(await call(null,host)).data};A.equal((await call({type:'move',from:17,to:24},guest)).status,400);
 let outcomes=await Promise.all([call({type:'move',from:40,to:33},host),call({type:'move',from:42,to:35},host)]);A.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);let state=(await call(null,guest)).data;A.equal(state.state.s,-1);A.equal(state.version,2);A.equal((await call({type:'move',from:17,to:24},guest)).status,409);guest={...guest,...state};x=await call({type:'move',from:17,to:24},guest);A.equal(x.status,200);A.equal(x.data.state.s,1);A.equal(x.data.state.b[24],-1);A.equal(x.data.token,undefined);
 host={...host,...(await call(null,host)).data};x=await call({type:'rematch'},host);A.equal(x.data.state.rematch.length,1);guest={...guest,...(await call(null,guest)).data};x=await call({type:'rematch'},guest);A.equal(x.data.state.b.filter(p=>p===1).length,12);A.equal(x.data.state.s,1);A.deepEqual(x.data.players,{gold:'Junior',black:'Andre'});A.deepEqual((await call(null,host)).data.players,{gold:'Junior',black:'Andre'});
 let bad=await fetch(origin+'/api/draff',{method:'POST',headers:{Origin:'https://elsewhere.test','Content-Type':'application/json'},body:'{"type":"create"}'});A.equal(bad.status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Draff preserves backward captures, flying kings, optional captures and Huff',async()=>{
 const {fresh,act,view}=await import('../draff/game.mjs');const position=()=>{let g=fresh();g.active=true;g.b=Array(64).fill(0);g.b[42]=1;g.b[35]=-1;g.b[46]=1;return g};
 let g=act(position(),1,{type:'move',from:42,to:33});A.equal(g.b[33],1);A.equal(view(g).pending,undefined);let h=act(g,-1,{type:'huff',at:33});A.equal(h.b[33],0);A.equal(h.s,-1);A.throws(()=>act(h,-1,{type:'huff',at:46}));A.throws(()=>act(g,-1,{type:'huff',at:46}));let moved=act(g,-1,{type:'move',from:35,to:42});A.equal(moved.pending.length,0);A.equal(moved.b[33],1);
 g=position();g.b[35]=0;g.b[51]=-1;g.b[33]=-1;let n=act(g,1,{type:'move',from:42,to:60});A.equal(n.b[51],0);A.deepEqual(view(n).captureSquares,[51]);g=position();g.b[46]=0;g.b[37]=-1;n=act(g,1,{type:'move',from:42,to:28});A.equal(n.chain,28);A.equal(n.s,1);n=act(n,1,{type:'move',from:28,to:46});A.equal(n.s,-1);g=position();g.b=Array(64).fill(0);g.b[56]=2;g.b[8]=-1;n=act(g,1,{type:'move',from:56,to:7});A.equal(n.b[7],2);
});
test('main app serves Draff menu, assets, rules and online endpoint on its own origin',async()=>{
 const {server,io}=require('../server');await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  let root=await (await fetch(origin+'/')).text();A.match(root,/href="\/draff\/"[^>]*>JAMAICAN DRAFF/);
  let page=await (await fetch(origin+'/draff/')).text();A.match(page,/href="\/">← Game menu/);A.match(page,/\/draff\/assets\/hummingbird.png/);A.doesNotMatch(page,/tdot-checkers|id="undo"/);A.match(page,/width:96%;height:96%/);A.match(page,/id="nameForm"/);A.match(page,/id="draffGame"[^>]*hidden inert/);
  for(let asset of ['app.js','engine.js','profile.js','online.js','assets/hummingbird.png'])A.equal((await fetch(origin+'/draff/'+asset)).status,200);
  let script=await (await fetch(origin+'/draff/online.js')).text();A.match(script,/\/api\/draff/);A.match(script,/new URL\('\/draff\/',location.origin\)/);
  const response=await fetch(origin+'/api/draff',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'create',name:'Junior'})});A.equal(response.status,200);A.equal((await response.json()).you,1);
 }finally{server.closeAllConnections();await new Promise(r=>io.close(r));}
});
