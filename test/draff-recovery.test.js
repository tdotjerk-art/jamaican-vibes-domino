const test=require('node:test'),A=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(){
 const nodes={},intervals=new Map(),saved=new Map();let id=0,response,requests=0;
 const el=()=>({value:'online',children:[],append(x){this.children.push(x)},replaceChildren(){this.children=[]},setAttribute(){},close(){},showModal(){}});
 const get=k=>nodes[k]||(nodes[k]=el());
 const c=vm.createContext({Checkers:require('../public/draff/engine'),document:{getElementById:get,createElement:el,addEventListener(){},hidden:false},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},location:{href:'https://game.test/draff/',origin:'https://game.test'},URL,setTimeout,clearTimeout,setInterval:fn=>{intervals.set(++id,fn);return id},clearInterval:id=>intervals.delete(id),fetch:async()=>{requests++;return response;}});
 for(const file of ['app.js','online.js'])vm.runInContext(fs.readFileSync('public/draff/'+file,'utf8'),c);
 const run=s=>vm.runInContext(s,c);
 const room={code:'ABCDEFGH',token:'a'.repeat(64),you:1,version:1,state:{b:require('../public/draff/engine').initial(),s:1,chain:-1,last:[],over:'',active:true,rematch:[]}};
 const enter=()=>{c.fixture=room;run('remember(fixture);receive(fixture,fixture.token);startPolling()');};
 return {run,get,enter,intervals,saved,setResponse:r=>response=r,requests:()=>requests};
}
test('Draff clears an expired room and shows creation controls after a restart',async()=>{
 const h=boot();h.enter();h.setResponse({ok:false,status:404,json:async()=>({error:'Room not found or expired. Create a new room.'})});
 await h.run('refreshRoom()');A.equal(h.run('netRoom'),null);A.equal(h.intervals.size,0);A.equal(h.saved.size,0);
 A.equal(h.get('roomSetup').hidden,false);A.match(h.get('connection').textContent,/not found or expired/);
 A.equal(h.get('new').disabled,true);
});
test('Draff keeps the token on temporary outages and restores the same board on recovery',async()=>{
 const h=boot();h.enter();h.setResponse({ok:false,status:503,json:async()=>({error:'Unavailable'})});await h.run('refreshRoom()');
 A.notEqual(h.run('netRoom'),null);A.equal(h.saved.size,1);A.match(h.get('connection').textContent,/Reconnecting/);
 h.setResponse({ok:true,json:async()=>JSON.parse(h.run('JSON.stringify(fixture)'))});await h.run('refreshRoom()');
 A.match(h.get('connection').textContent,/Connected/);
});
test('a late Draff response cannot replace a new local game or save an abandoned room',async()=>{
 const h=boot();let finish;h.setResponse({ok:true,json:()=>new Promise(r=>finish=r)});
 const pending=h.run('enterRoom("create")');await new Promise(setImmediate);
 h.run('mode.value="local";mode.onchange()');finish({code:'ABCDEFGH',token:'a'.repeat(64),version:0,state:{}});await pending;
 A.equal(h.saved.size,0);A.equal(h.intervals.size,0);A.equal(h.run('netBusy'),false);
});
