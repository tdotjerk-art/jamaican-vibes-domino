const {test}=require('node:test'),A=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const browserEngine=require('../public/draff/engine');
function board(piece=1){let b=Array(64).fill(0);b[42]=piece;for(const i of [35,19,33])b[i]=-1;return b;}
function harness(piece){const jobs=new Map();let id=0;const nodes={},el=()=>({value:'local',children:[],append(x){this.children.push(x)},replaceChildren(){this.children=[]},setAttribute(){},close(){},showModal(){}});const c=vm.createContext({Checkers:browserEngine,document:{getElementById:k=>nodes[k]||(nodes[k]=el()),createElement:el},setTimeout(fn){jobs.set(++id,fn);return id},clearTimeout(key){jobs.delete(key)}});vm.runInContext(fs.readFileSync('public/draff/app.js','utf8'),c);c.fixture=board(piece);vm.runInContext('b=fixture.slice();s=1;render()',c);return {run:s=>vm.runInContext(s,c),nodes,jobs};}
for(const piece of [1,2]){
 const label=piece===2?'king':'regular piece';
 test(`${label}: shorter completed route is Huff in browser and server engines`,async()=>{
  const serverEngine=await import('../draff/engine.mjs');
  for(const E of [browserEngine,serverEngine]){
   const b=board(piece);A.equal(E.maxCaptures(b,1),2);
   const short=E.turns(b,1).find(t=>t.path.length===1&&t.path[0].to===24);
   A.deepEqual(E.missed(b,1,short.path),[24]);A.equal(E.claim(short.board,-1,[24],24)[24],0);
   const full=E.turns(b,1).find(t=>t.path.length===2);A.deepEqual(E.missed(b,1,full.path),[]);
  }
 });
 test(`${label}: online Huff tracks final square, early ending, and claim expiry`,async()=>{
  const {fresh,act,view}=await import('../draff/game.mjs');const start=()=>({...fresh(),active:true,b:board(piece)});
  let g=act(start(),1,{type:'move',from:42,to:24});A.equal(g.s,-1);A.deepEqual(g.pending,[24]);
  A.equal(view(g).pending,undefined);A.equal(view(g).turnBoard,undefined);A.equal(view(g).turnPath,undefined);
  A.throws(()=>act(g,-1,{type:'huff',at:19}));g=act(g,-1,{type:'huff',at:24});A.equal(g.b[24],0);A.equal(g.s,-1);A.deepEqual(g.pending,[]);
  g=act(start(),1,{type:'move',from:42,to:28});A.equal(g.s,1);A.equal(g.chain,28);A.throws(()=>act(g,-1,{type:'endCapture'}));
  A.equal(view(g).turnBoard,undefined);A.equal(view(g).turnPath,undefined);
  const full=act(g,1,{type:'move',from:28,to:10});A.deepEqual(full.pending,[]);A.throws(()=>act(full,-1,{type:'huff',at:10}));
  g=act(g,1,{type:'endCapture'});A.equal(g.s,-1);A.deepEqual(g.pending,[28]);A.equal(act(g,-1,{type:'huff',at:28}).b[28],0);
  const next=browserEngine.moves(g.b,-1).find(m=>m.take===undefined);g=act(g,-1,{type:'move',from:next.from,to:next.to});A.equal(g.b[28],piece);A.ok(!g.pending.includes(28));
  A.throws(()=>act(start(),1,{type:'endCapture'}));
 });
 test(`${label}: same-device shorter route and early stop can be huffed through controls`,()=>{
  let h=harness(piece);h.run('click(42);click(24)');A.equal(h.run('s'),-1);h.nodes.claim.onclick();h.run('click(24)');A.equal(h.run('b[24]'),0);
  h=harness(piece);h.run('click(42);click(28)');A.equal(h.nodes.endCapture.hidden,false);h.nodes.endCapture.onclick();A.equal(h.run('s'),-1);A.equal(h.nodes.endCapture.hidden,true);h.nodes.claim.onclick();h.run('click(28)');A.equal(h.run('b[28]'),0);
  h=harness(piece);h.run('click(42);click(28);click(10)');h.nodes.claim.onclick();h.run('click(10)');A.equal(h.run('b[10]'),piece);A.equal(h.nodes.hint.textContent,'That piece cannot be huffed.');
 });
}
test('taking two when three were available is Huff; crowning still ends a regular capture',()=>{
 let b=board();b[33]=0;b[17]=-1;
 A.equal(browserEngine.maxCaptures(b,1),3);
 const path=[{from:42,to:28,take:35},{from:28,to:10,take:19}];A.deepEqual(browserEngine.missed(b,1,path),[10]);
 b=Array(64).fill(0);b[17]=1;b[10]=-1;b[12]=-1;const m={from:17,to:3,take:10};const n=browserEngine.apply(b,m);A.equal(n.board[3],2);A.equal(n.again,false);A.deepEqual(browserEngine.missed(b,1,[m]),[]);
});
test('computer chooses the full available capture sequence and exposes no Huff for it',()=>{
 const h=harness(2);h.run('b=fixture.map(p=>-p);s=-1;mode.value="ai";level.value="2";busy=true;ai()');
 while(h.jobs.size){const [key,fn]=h.jobs.entries().next().value;h.jobs.delete(key);fn();}
 A.equal(h.run('b.filter(p=>p>0).length'),1);A.equal(h.run('pending.length'),0);A.equal(h.run('s'),1);
});
test('computer can notice and Huff a human who chose a shorter capture',()=>{
 const h=harness(1);h.run('mode.value="ai";level.value="5";click(42);click(24)');
 A.equal(h.run('b[24]'),1);A.equal(h.run('busy'),true);
 const [key,fn]=h.jobs.entries().next().value;h.jobs.delete(key);fn();
 A.equal(h.run('b[24]'),0);h.run('reset()');
});
