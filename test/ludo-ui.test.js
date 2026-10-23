const test=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../public/ludo/engine');
function element(){return {children:[],style:{},value:'',hidden:false,disabled:false,textContent:'',attributes:{},append(...els){this.children.push(...els)},replaceChildren(...els){this.children=els},setAttribute(k,v){this.attributes[k]=v},classList:{toggle(){}}};}
function boot(die=6){
 const nodes={},timeouts=new Map(),intervals=new Map(),storage=new Map([['jv-draff-player-name-v1','Junior']]);let next=0,response,lastBody;
 const get=id=>nodes[id]||(nodes[id]=element());get('mode').value='ai';get('count').value='2';get('name').value='Junior';
 const context=vm.createContext({JVLudo:{...E,act:(g,seat,a)=>E.act(g,seat,a,()=>die)},document:{getElementById:get,createElement:element,createElementNS:element,body:element(),addEventListener(){},hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(fn,ms)=>{timeouts.set(++next,{fn,ms});return next},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.set(++next,fn);return next},clearInterval:id=>intervals.delete(id),location:{origin:'https://game.test',href:'https://game.test/ludo/'},URL,navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,fetch:async(url,options)=>{lastBody=options.body?JSON.parse(options.body):null;return response}});
 vm.runInContext(fs.readFileSync('public/ludo/app.js','utf8'),context);
 return {get,timeouts,intervals,storage,setResponse:r=>response=r,lastBody:()=>lastBody,start:()=>get('setupForm').onsubmit({preventDefault(){}}),tick(){const [id,job]=timeouts.entries().next().value;timeouts.delete(id);job.fn();return job.ms;}};
}
test('Ludo renders a numbered board, validates names and makes human and computer moves at separate speeds',()=>{
 const ui=boot();ui.get('name').value=' ';ui.start();A.match(ui.get('error').textContent,/name/);A.equal(ui.get('gamePanel').hidden,true);
 ui.get('name').value='Junior';ui.start();A.equal(ui.get('gamePanel').hidden,false);A.equal(ui.get('roll').disabled,false);A.equal(ui.get('seats').children.length,2);
 ui.get('roll').onclick();A.equal(ui.get('moves').children.length,4);A.equal(ui.get('quickMoves').children.length,4);A.equal(ui.get('dice').attributes['aria-label'],'Last roll: 6');
 ui.get('moves').children[0].onclick();ui.get('roll').onclick();ui.get('moves').children[0].onclick();ui.get('roll').onclick();
 A.match(ui.get('turnBanner').textContent,/thinking/);A.equal(ui.get('roll').disabled,true);A.equal(ui.timeouts.size,1);A.equal([...ui.timeouts.values()][0].ms,1400);
 ui.tick();A.equal([...ui.timeouts.values()][0].ms,1100);ui.tick();A.equal([...ui.timeouts.values()][0].ms,1400);
 ui.get('leave').onclick();A.equal(ui.timeouts.size,0);A.equal(ui.get('setup').hidden,false);A.equal(ui.get('quickControls').hidden,true);
});
test('same-device play allows the next person to roll on the same browser',()=>{
 const ui=boot(1);ui.get('mode').value='local';ui.start();ui.get('roll').onclick();A.match(ui.get('turnBanner').textContent,/Player 2/);A.equal(ui.get('roll').disabled,false);A.equal(ui.timeouts.size,0);
 ui.get('roll').onclick();A.match(ui.get('turnBanner').textContent,/Junior/);
});
test('online Ludo sends the name and count, waits for players, and recovers from a lost room',async()=>{
 const ui=boot(),host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:0,total:2,players:['Junior'],state:null,votes:[]};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>host});ui.start();await new Promise(setImmediate);
 A.equal(ui.lastBody().name,'Junior');A.equal(ui.lastBody().total,2);A.equal(ui.get('startOnline').disabled,true);A.equal(ui.storage.has('jv-ludo-room-v1'),true);
 ui.setResponse({ok:true,json:async()=>({...host,version:1,players:['Junior','Andre']})});await [...ui.intervals.values()][0]();A.equal(ui.get('startOnline').disabled,false);
 ui.setResponse({ok:true,json:async()=>({...host,version:2,players:['Junior','Andre'],state:E.fresh(['Junior','Andre'])})});await ui.get('startOnline').onclick();A.equal(ui.get('roll').disabled,false);A.equal(ui.get('playControls').hidden,false);
 ui.setResponse({ok:false,status:404,json:async()=>({error:'Room not found or expired. Create a new room.'})});await [...ui.intervals.values()][0]();
 A.equal(ui.get('setup').hidden,false);A.equal(ui.storage.has('jv-ludo-room-v1'),false);A.equal(ui.intervals.size,0);A.match(ui.get('error').textContent,/not found/);
});
