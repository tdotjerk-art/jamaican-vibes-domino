const test=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../public/ludo/engine');
function element(){return {children:[],style:{},value:'',hidden:false,disabled:false,textContent:'',attributes:{},append(...els){this.children.push(...els)},replaceChildren(...els){this.children=els},setAttribute(k,v){this.attributes[k]=v},classList:{toggle(){}}};}
function boot(die=[6,1]){
 const nodes={},timeouts=new Map(),intervals=new Map(),storage=new Map([['jv-draff-player-name-v1','Junior']]);let next=0,response,lastBody;
 const get=id=>nodes[id]||(nodes[id]=element());get('mode').value='ai';get('count').value='2';get('name').value='Junior';
 const context=vm.createContext({JVLudiLayout:require('../public/ludo/layout'),JVLudo:{...E,act:(g,seat,a)=>{let next=0;return E.act(g,seat,a,()=>Array.isArray(die)?die[next++]:die)}},document:{getElementById:get,createElement:element,createElementNS:element,body:element(),addEventListener(){},hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(fn,ms)=>{timeouts.set(++next,{fn,ms});return next},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.set(++next,fn);return next},clearInterval:id=>intervals.delete(id),location:{origin:'https://game.test',href:'https://game.test/ludo/'},URL,navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,fetch:async(url,options)=>{lastBody=options.body?JSON.parse(options.body):null;return response}});
 vm.runInContext(fs.readFileSync('public/ludo/app.js','utf8'),context);
 return {get,timeouts,intervals,storage,setResponse:r=>response=r,lastBody:()=>lastBody,start:()=>get('setupForm').onsubmit({preventDefault(){}}),tick(){const [id,job]=timeouts.entries().next().value;timeouts.delete(id);job.fn();return job.ms;}};
}
test('two dice tumble on the table before moves unlock; computer rolls and moves pause separately',()=>{
 const ui=boot();ui.get('name').value=' ';ui.start();A.match(ui.get('error').textContent,/name/);A.equal(ui.get('gamePanel').hidden,true);
 ui.get('name').value='Junior';ui.start();A.equal(ui.get('gamePanel').hidden,false);A.equal(ui.get('tableDice').hidden,false);A.equal(ui.get('tableRoll').disabled,false);
 for(let turn=0;turn<2;turn++){
  ui.get('tableRoll').onclick();A.match(ui.get('tableDice').className,/rolling/);A.equal(ui.get('roll').disabled,true);A.equal(ui.get('moves').children.length,0);A.equal([...ui.timeouts.values()][0].ms,950);
  ui.tick();A.equal(ui.get('moves').children.length,4);A.equal(ui.get('tableDie0').attributes['aria-label'],'Die 1: 6');A.equal(ui.get('tableDie1').attributes['aria-label'],'Die 2: 1');
  ui.get('moves').children[0].onclick();A.match(ui.get('tableDie0').className,/used/);A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');ui.get('moves').children[0].onclick();
 }
 ui.get('tableRoll').onclick();A.equal(ui.tick(),950);A.match(ui.get('turnBanner').textContent,/thinking/);A.equal(ui.get('tableRoll').disabled,true);A.equal([...ui.timeouts.values()][0].ms,1400);
 ui.tick();A.equal([...ui.timeouts.values()][0].ms,950);ui.tick();A.equal([...ui.timeouts.values()][0].ms,1100);ui.tick();A.equal([...ui.timeouts.values()][0].ms,1100);
 ui.get('leave').onclick();A.equal(ui.timeouts.size,0);A.equal(ui.get('setup').hidden,false);A.equal(ui.get('tableDice').hidden,true);
});
test('either table die can be selected first and both show actual pips',()=>{
 const ui=boot([6,6]);ui.start();ui.get('tableRoll').onclick();ui.tick();
 for(let die=0;die<2;die++)A.equal(ui.get('tableDie'+die).children[0].children.filter(dot=>dot.className.includes(' on')).length,6);
 ui.get('tableDie1').onclick();A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');
 ui.get('moves').children[0].onclick();A.match(ui.get('tableDie1').className,/used/);A.equal(ui.get('tableDie0').attributes['aria-pressed'],'true');
 ui.get('moves').children[0].onclick();A.equal(ui.get('tableRoll').disabled,false);
});
test('same-device play allows the next person to roll on the same browser',()=>{
 const ui=boot(1);ui.get('mode').value='local';ui.start();ui.get('roll').onclick();ui.tick();A.match(ui.get('turnBanner').textContent,/Player 2/);A.equal(ui.get('roll').disabled,false);A.equal(ui.timeouts.size,0);
 ui.get('roll').onclick();ui.tick();A.match(ui.get('turnBanner').textContent,/Junior/);
});
test('online Ludo sends the name and count, waits for players, and recovers from a lost room',async()=>{
 const ui=boot(),host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:0,total:2,players:['Junior'],state:null,votes:[]};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>host});ui.start();await new Promise(setImmediate);
 A.equal(ui.lastBody().name,'Junior');A.equal(ui.lastBody().total,2);A.equal(ui.get('startOnline').disabled,true);A.equal(ui.storage.has('jv-ludo-room-v1'),true);
 ui.setResponse({ok:true,json:async()=>({...host,version:1,players:['Junior','Andre']})});await [...ui.intervals.values()][0]();A.equal(ui.get('startOnline').disabled,false);
 ui.setResponse({ok:true,json:async()=>({...host,version:2,players:['Junior','Andre'],state:E.fresh(['Junior','Andre'])})});await ui.get('startOnline').onclick();A.equal(ui.get('roll').disabled,false);A.equal(ui.get('playControls').hidden,false);
 let draw=0;const pair=E.act(E.fresh(['Junior','Andre']),0,{type:'roll'},()=>[6,2][draw++]);const rolled={...host,version:3,players:['Junior','Andre'],state:pair};
 ui.setResponse({ok:true,json:async()=>rolled});await ui.get('tableRoll').onclick();A.match(ui.get('tableDice').className,/rolling/);
 const animation=[...ui.timeouts.keys()][0];await [...ui.intervals.values()][0]();A.equal([...ui.timeouts.keys()][0],animation);ui.tick();A.equal(ui.get('moves').children.length,4);
 const moved=E.act(pair,0,{type:'move',piece:0,die:0});ui.setResponse({ok:true,json:async()=>({...rolled,version:4,state:moved})});await ui.get('moves').children[0].onclick();A.equal(ui.lastBody().die,0);A.match(ui.get('tableDie0').className,/used/);A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');

 ui.setResponse({ok:false,status:404,json:async()=>({error:'Room not found or expired. Create a new room.'})});await [...ui.intervals.values()][0]();
 A.equal(ui.get('setup').hidden,false);A.equal(ui.storage.has('jv-ludo-room-v1'),false);A.equal(ui.intervals.size,0);A.match(ui.get('error').textContent,/not found/);
});

test('both dice match all four players and keep the actual roller color until the animation finishes',()=>{
 const ui=boot([1,1]);ui.get('mode').value='local';ui.get('count').value='4';ui.start();
 for(let seat=0;seat<4;seat++){
  for(let die=0;die<2;die++)A.equal(ui.get('tableDie'+die).style.background,E.TEAMS[seat].color);
  ui.get('tableRoll').onclick();
  for(let die=0;die<2;die++)A.equal(ui.get('tableDie'+die).style.background,E.TEAMS[seat].color);
  ui.tick();
  for(let die=0;die<2;die++){const button=ui.get('tableDie'+die),next=(seat+1)%4;A.equal(button.style.background,E.TEAMS[next].color);A.equal(button.style.color,next===3?'#102519':'#fff4d0');}
 }
});

test('a 5 and 6 select and highlight the six first, then unlock and highlight the five',()=>{
 const ui=boot([5,6]);ui.get('mode').value='local';ui.start();ui.get('tableRoll').onclick();ui.tick();
 A.equal(ui.get('tableDie0').disabled,true);A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');A.match(ui.get('tableDie1').className,/higher/);A.doesNotMatch(ui.get('tableDie0').className,/higher/);
 ui.get('tableDie0').onclick();A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');ui.get('moves').children[0].onclick();
 A.equal(ui.get('tableDie0').disabled,false);A.equal(ui.get('tableDie0').attributes['aria-pressed'],'true');A.match(ui.get('tableDie0').className,/higher/);A.doesNotMatch(ui.get('tableDie1').className,/higher/);
 ui.get('moves').children[0].onclick();A.equal(ui.get('tableRoll').disabled,false);
});
