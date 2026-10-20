const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Engine=require('../public/three-cards-engine');
function element(){return {children:[],textContent:'',hidden:false,disabled:false,value:'5',open:false,append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};}
function boot(api=Engine){
 const elements=new Map(),timers=new Map(),handlers={},sent=[];let timerId=0;
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 get('name').value='Junior';
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
test('solo interface declares, waits for computers, and displays strongest call before matching resumes',()=>{
 const g=fixture(),ui=boot({...Engine,Game:class{constructor(){return g;}}});
 ui.get('solo').onclick();assert.match(ui.get('actions').children[0].textContent,/Declare Flush, straight and threes/);
 ui.get('actions').children[0].onclick();assert.equal(g.declarations[0],true);assert(ui.get('actions').children.every(b=>b.disabled));
 for(let i=0;i<3;i++)assert(ui.tick());
 assert.deepEqual(g.callSummary.winners,[3]);assert.deepEqual(g.players.map(p=>p.score),[-3,-3,-3,9]);
 assert.match(ui.get('callResult').textContent,/Winston won Flush, straight and threes/);assert.match(ui.get('callResult').textContent,/Winston \+9/);
 assert.equal(g.phase,'draw');assert.equal(ui.get('error').textContent,'');
});
test('online interface emits declaration choices, shows shared results, and pauses controls on disconnect',()=>{
 const g=fixture(),ui=boot();ui.get('create').onclick();
 const state=()=>({code:'ABCDEF',seat:0,seats:g.players.map(p=>({name:p.name,connected:true,total:5,ready:true})),game:g.view(0)});
 ui.handlers.state(state());ui.get('actions').children[0].onclick();
 assert.equal(ui.sent.at(-1).event,'action');assert.equal(ui.sent.at(-1).data.type,'declare');assert.equal(ui.sent.at(-1).data.claim,true);
 g.players[3].hand=[{id:'♣11',rank:11,suit:'♣'},{id:'♦11',rank:11,suit:'♦'},{id:'♥6',rank:6,suit:'♥'}];
 for(let i=0;i<4;i++)g.declare(i,i!==2);
 ui.handlers.state(state());assert.match(ui.get('callResult').textContent,/Junior & Winston share/);assert.match(ui.get('callResult').textContent,/Junior \+3/);
 const paused=state();paused.seats[1].connected=false;ui.handlers.state(paused);assert.equal(ui.get('actions').children.length,0);assert.match(ui.get('message').textContent,/paused/);
});
