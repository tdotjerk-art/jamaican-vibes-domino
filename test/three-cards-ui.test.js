const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Engine=require('../public/three-cards-engine');
function element(){const el={children:[],textContent:'',className:'',attributes:{},hidden:false,disabled:false,value:'5',open:false,append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};el.classList={add(...names){el.className=[...new Set([...el.className.split(' ').filter(Boolean),...names])].join(' ');},remove(name){el.className=el.className.split(' ').filter(x=>x!==name).join(' ');},toggle(name,force){const has=el.className.split(' ').includes(name),on=force===undefined?!has:!!force;if(on)this.add(name);else this.remove(name);return on;}};return el;}
function descendants(el){return el.children.flatMap(child=>[child,...descendants(child)]);}
function text(el){return [el,...descendants(el)].map(el=>el.textContent).filter(Boolean).join(' ');}
function settle(g){for(let i=0;i<g.players.length;i++)g.declare(i,!!Engine.evaluateCall(g.players[i].hand));return g;}

function boot(api=Engine){
 const elements=new Map(),timers=new Map(),handlers={},sent=[];let timerId=0;
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 get('name').value='Junior';get('count').value='4';
 const socket={connected:true,on:(event,fn)=>handlers[event]=fn,emit:(event,data)=>sent.push({event,data}),disconnect(){this.connected=false;}};
 const context={JVThreeCards:api,document:{getElementById:get,createElement:element,activeElement:null},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),confirm:()=>true,io:()=>socket};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/three-cards-ui.js','utf8'),context);
 const tick=()=>{const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1]();}return !!next;};
 return {get,tick,handlers,sent,socket};
}
function fixture(){
 const g=new Engine.Game(['Junior','Andre','Simone','Winston']);g.dealer=0;g.phase='declare';g.declarations=[null,null,null,null];
 const ranks=[[11,11,6],[6,6,11],[2,5,9],[2,2,2]],suits=['♠','♥','♦'];
 g.players.forEach((p,i)=>p.hand=ranks[i].map((rank,j)=>({id:suits[j]+rank,rank,suit:suits[j]})));
 g.pile=[{id:'♣13',rank:13,suit:'♣'}];g.stock=[{id:'♣4',rank:4,suit:'♣'}];g.nextDrawer=2;return g;
}
test('solo interface announces automatic calls, conceals winning cards and schedules computer play',()=>{
 const g=settle(fixture()),ui=boot({...Engine,Game:class{constructor(){return g;}}});
 ui.get('solo').onclick();
 assert(ui.get('actions').children.every(b=>!/Declare/.test(b.textContent)));
 assert.deepEqual(g.callSummary.winners,[3]);assert.deepEqual(g.players.map(p=>p.score),[-3,-3,-3,9]);
 assert.match(ui.get('callResult').textContent,/Winston calls Flush, straight and threes/);assert.match(ui.get('callResult').textContent,/Winston has the strongest call/);assert.match(ui.get('callResult').textContent,/Winston \+9/);
 const opponents=ui.get('players').children.slice(1);for(const [i,el] of opponents.entries()){if(g.callSummary.winners.includes(i+1))assert.match(text(el),/CALL:/);else assert.doesNotMatch(text(el),/CALL:/);assert.equal(descendants(el).filter(n=>n.className.split(' ').includes('back')).length,3);assert(!descendants(el).some(n=>n.className.includes('winning-cards')));}
 assert(ui.tick());assert.equal(ui.get('error').textContent,'');
});
test('online interface shows settled calls, preserves matching controls and pauses on disconnect',()=>{
 const g=fixture();g.players[3].hand=[{id:'♣11',rank:11,suit:'♣'},{id:'♦11',rank:11,suit:'♦'},{id:'♥6',rank:6,suit:'♥'}];settle(g);
 const ui=boot();ui.get('create').onclick();
 const state=()=>({code:'ABCDEF',seat:0,seats:g.players.map(p=>({name:p.name,connected:true,total:5,ready:true})),game:g.view(0)});
 ui.handlers.state(state());assert.match(ui.get('callResult').textContent,/Junior & Winston share/);assert.match(ui.get('callResult').textContent,/Junior \+3/);
 assert(!ui.sent.some(p=>p.event==='action'&&p.data.type==='declare'));assert(ui.get('actions').children.every(b=>!/Declare/.test(b.textContent)));
 const ownTurn=state();ownTurn.game.turn=0;ownTurn.game.phase='draw';ui.handlers.state(ownTurn);ui.get('actions').children[0].onclick();assert.equal(ui.sent.at(-1).data.type,'draw');
 const paused=state();paused.seats[1].connected=false;ui.handlers.state(paused);assert.equal(ui.get('actions').children.length,0);assert.match(ui.get('message').textContent,/paused/);
});

test('solo selection creates two, three, or four players and rejects invalid counts',()=>{
 for(const count of [2,3,4]){
  let names;const ui=boot({...Engine,Game:class extends Engine.Game{constructor(players,total){names=players;super(players,total);}}});
  ui.get('count').value=String(count);ui.get('solo').onclick();assert.equal(names.length,count);assert.equal(names[0],'Junior');assert.equal(ui.get('players').children.length,count);
 }
 for(const count of ['1','5','2.5']){const ui=boot();ui.get('count').value=count;ui.get('solo').onclick();assert.match(ui.get('error').textContent,/Choose 2, 3, or 4/);}
});
test('online host start button permits two to four ready players only',()=>{
 const ui=boot();ui.get('create').onclick();
 for(const count of [1,2,3,4,5]){
  const seats=Array.from({length:count},(_,i)=>({name:'P'+i,connected:true,ready:true,total:5}));
  ui.handlers.state({code:'ABCDEF',seat:0,seats,game:null});assert.equal(ui.get('start').disabled,count<2||count>4);
  if(count>=2&&count<=4){seats[1].ready=false;ui.handlers.state({code:'ABCDEF',seat:0,seats,game:null});assert.equal(ui.get('start').disabled,true);}
 }
});

test('a lost online table returns to setup instead of trapping the player in a paused game',()=>{
 const ui=boot(),g=settle(fixture());ui.get('create').onclick();
 ui.handlers.state({code:'ABCDEF',seat:0,seats:g.players.map(p=>({name:p.name,connected:true})),game:g.view(0)});
 assert.equal(ui.get('setup').hidden,true);
 ui.handlers['card-error']('This table is no longer available. Create a new one.');
 assert.equal(ui.get('setup').hidden,false);assert.equal(ui.get('game').hidden,true);
 assert.match(ui.get('error').textContent,/no longer available/);
});
