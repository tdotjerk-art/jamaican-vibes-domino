const test=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../public/ludi/engine');
function element(){return {children:[],style:{},value:'',hidden:false,disabled:false,textContent:'',attributes:{},append(...els){this.children.push(...els)},replaceChildren(...els){this.children=els},setAttribute(k,v){this.attributes[k]=v},classList:{toggle(){}}};}
function boot(die=[6,1]){
 const nodes={},timeouts=new Map(),intervals=new Map(),storage=new Map([['jv-draff-player-name-v1','Junior']]);let next=0,response,lastBody,now=100000;const events={};
 const get=id=>nodes[id]||(nodes[id]=element());get('mode').value='ai';get('count').value='2';get('name').value='Junior';
 const context=vm.createContext({Date:class extends Date{static now(){return now}},addEventListener:(name,fn)=>events[name]=fn,JVLudiTutorial:require('../public/ludi/tutorial'),JVLudiLayout:require('../public/ludi/layout'),JVLUDI:{...E,act:(g,seat,a)=>{let next=0;const pair=typeof die==='function'?die(g,seat,a):die;return E.act(g,seat,a,()=>Array.isArray(pair)?pair[next++]:pair)}},document:{getElementById:get,createElement:element,createElementNS:element,body:element(),addEventListener(){},hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(fn,ms)=>{timeouts.set(++next,{fn,ms});return next},clearTimeout:id=>timeouts.delete(id),setInterval:(fn,ms)=>{fn.ms=ms;intervals.set(++next,fn);return next},clearInterval:id=>intervals.delete(id),location:{origin:'https://game.test',href:'https://game.test/ludi/'},URL,navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,fetch:async(url,options)=>{if(url.startsWith('/api/ludi/profile'))return {ok:true,json:async()=>({profile:{id:'b'.repeat(32),name:'Junior',wins:0,games:0,winRate:0},token:'c'.repeat(64)})};lastBody=options.body?JSON.parse(options.body):null;if(response instanceof Error)throw response;return typeof response==='function'?response():response}});
 vm.runInContext(fs.readFileSync('public/ludi/app.js','utf8'),context);
 return {get,timeouts,intervals,storage,events,advance:ms=>now+=ms,now:()=>now,poll:()=>[...intervals.values()].find(fn=>fn.ms===1500)?.(),indicators:()=>[...intervals.values()].find(fn=>fn.ms===250)?.(),setResponse:r=>response=r,lastBody:()=>lastBody,start:()=>get('setupForm').onsubmit({preventDefault(){}}),tick(){const [id,job]=timeouts.entries().next().value;timeouts.delete(id);job.fn();return job.ms;}};
}
test('two dice tumble on the table before moves unlock; computer rolls and moves pause separately',()=>{
 const ui=boot((g,seat)=>seat===0&&g.rollNo===3?[1,1]:[6,1]);ui.get('name').value=' ';ui.start();A.match(ui.get('error').textContent,/name/);A.equal(ui.get('gamePanel').hidden,true);
 ui.get('name').value='Junior';ui.start();A.equal(ui.get('gamePanel').hidden,false);A.equal(ui.get('tableDice').hidden,false);A.equal(ui.get('tableRoll').disabled,false);
 for(let turn=0;turn<3;turn++){
  ui.get('tableRoll').onclick();A.match(ui.get('tableDice').className,/rolling/);A.equal(ui.get('roll').disabled,true);A.equal(ui.get('moves').children.length,0);A.equal([...ui.timeouts.values()][0].ms,950);
  ui.tick();A.equal(ui.get('moves').children.length,4);A.equal(ui.get('tableDie0').attributes['aria-label'],'Die 1: 6');A.equal(ui.get('tableDie1').attributes['aria-label'],'Die 2: 1');
  ui.get('moves').children[0].onclick();A.match(ui.get('tableDie0').className,/used/);A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');ui.get('moves').children[0].onclick();
 }
 ui.get('tableRoll').onclick();A.equal(ui.tick(),950);ui.get('moves').children[0].onclick();ui.get('moves').children[0].onclick();A.match(ui.get('turnBanner').textContent,/thinking/);A.equal(ui.get('tableRoll').disabled,true);A.equal([...ui.timeouts.values()][0].ms,1400);
 ui.tick();A.equal([...ui.timeouts.values()][0].ms,950);ui.tick();A.equal([...ui.timeouts.values()][0].ms,1100);ui.tick();A.equal([...ui.timeouts.values()][0].ms,1100);
 ui.get('leave').onclick();A.ok([...ui.timeouts.values()].every(t=>t.ms===10000));A.equal(ui.get('setup').hidden,false);A.equal(ui.get('tableDice').hidden,true);
});
test('either table die can be selected first and both show actual pips',()=>{
 const ui=boot([6,6]);ui.start();ui.get('tableRoll').onclick();ui.tick();
 for(let die=0;die<2;die++)A.equal(ui.get('tableDie'+die).children[0].children.filter(dot=>dot.className.includes(' on')).length,6);
 ui.get('tableDie1').onclick();A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');
 ui.get('moves').children[0].onclick();A.match(ui.get('tableDie1').className,/used/);A.equal(ui.get('tableDie0').attributes['aria-pressed'],'true');
 ui.get('moves').children[0].onclick();A.equal(ui.get('tableRoll').disabled,false);
});
test('same-device play allows the next person to roll on the same browser',()=>{
 const ui=boot(1);ui.get('mode').value='local';ui.start();ui.get('roll').onclick();ui.tick();A.match(ui.get('turnBanner').textContent,/Player 2/);A.equal(ui.get('roll').disabled,false);A.equal(ui.timeouts.size,1);A.equal([...ui.timeouts.values()][0].ms,10000);
 ui.get('roll').onclick();ui.tick();A.match(ui.get('turnBanner').textContent,/Junior/);
});
test('online Ludi sends the name and count, waits for players, and recovers from a lost room',async()=>{
 const ui=boot(),host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:0,total:2,players:['Junior'],state:null,votes:[]};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>host});ui.start();await new Promise(setImmediate);
 A.equal(ui.lastBody().name,'Junior');A.equal(ui.lastBody().total,2);A.equal(ui.get('startOnline').disabled,true);A.equal(ui.storage.has('jv-ludi-room-v1'),true);
 ui.setResponse({ok:true,json:async()=>({...host,version:1,players:['Junior','Andre']})});await ui.poll();A.equal(ui.get('startOnline').disabled,false);
 ui.setResponse({ok:true,json:async()=>({...host,version:2,players:['Junior','Andre'],state:E.fresh(['Junior','Andre'])})});await ui.get('startOnline').onclick();A.equal(ui.get('roll').disabled,false);A.equal(ui.get('playControls').hidden,false);
 let draw=0;const pair=E.act(E.fresh(['Junior','Andre']),0,{type:'roll'},()=>[6,2][draw++]);const rolled={...host,version:3,players:['Junior','Andre'],state:pair};
 ui.setResponse({ok:true,json:async()=>rolled});await ui.get('tableRoll').onclick();A.match(ui.get('tableDice').className,/rolling/);
 const animation=[...ui.timeouts.keys()][0];await ui.poll();A.equal([...ui.timeouts.keys()][0],animation);ui.tick();A.equal(ui.get('moves').children.length,4);
 const moved=E.act(pair,0,{type:'move',piece:0,die:0});ui.setResponse({ok:true,json:async()=>({...rolled,version:4,state:moved})});await ui.get('moves').children[0].onclick();A.equal(ui.lastBody().die,0);A.match(ui.get('tableDie0').className,/used/);A.equal(ui.get('tableDie1').attributes['aria-pressed'],'true');

 ui.setResponse({ok:false,status:404,json:async()=>({error:'Room not found or expired. Create a new room.'})});await ui.poll();
 A.equal(ui.get('setup').hidden,false);A.equal(ui.storage.has('jv-ludi-room-v1'),false);A.equal(ui.intervals.size,0);A.match(ui.get('error').textContent,/not found/);
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

test('local countdown ticks without redrawing or extending the automatic action and clears on leaving',()=>{
 const ui=boot([6,6]);ui.get('mode').value='local';ui.start();
 A.equal(ui.get('turnClock').textContent,'10s');A.equal(ui.get('turnClock').hidden,false);
 const board=ui.get('board').children[0],timer=[...ui.timeouts.keys()][0];
 ui.advance(3500);ui.indicators();A.equal(ui.get('turnClock').textContent,'7s');A.equal(ui.get('board').children[0],board);A.equal([...ui.timeouts.keys()][0],timer);
 ui.get('roll').onclick();A.equal(ui.get('turnClock').hidden,true);ui.tick();
 ui.advance(3000);ui.indicators();A.equal(ui.get('turnClock').textContent,'7s');
 const moveTimer=[...ui.timeouts.keys()][0];ui.get('tableDie1').onclick();A.equal(ui.get('turnClock').textContent,'7s');A.equal([...ui.timeouts.keys()][0],moveTimer);
 const active=ui.get('seats').children.filter(seat=>seat.className.includes('active'));A.equal(active.length,1);A.equal(active[0].children[0].children.at(-1).textContent,'7s');
 ui.advance(4000);ui.indicators();A.equal(ui.get('turnClock').textContent,'3s');A.match(ui.get('turnClock').className,/urgent/);
 ui.get('leave').onclick();A.equal(ui.get('turnClock').hidden,true);A.equal(ui.get('connectionBadge').hidden,true);A.equal(ui.intervals.size,0);
});

test('online countdown follows the server clock and deadline, including clock skew and repeat polls',async()=>{
 const ui=boot(),state=E.fresh(['Junior','Andre']);
 const host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:2,total:2,players:['Junior','Andre'],state,votes:[],serverNow:ui.now()+60000,deadline:ui.now()+70000};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>({...host})});ui.start();await new Promise(setImmediate);
 A.equal(ui.get('turnClock').textContent,'10s');A.equal(ui.get('connectionBadge').textContent,'Connected');
 ui.advance(3400);ui.indicators();A.equal(ui.get('turnClock').textContent,'7s');
 host.serverNow+=3400;await ui.poll();A.equal(ui.get('turnClock').textContent,'7s','polling must not restart the countdown');
 ui.advance(8000);ui.indicators();A.equal(ui.get('turnClock').textContent,'0s','wait for the authoritative update instead of going negative');
 A.equal(ui.timeouts.size,0,'online play must not schedule a second client automatic turn');
});

test('connection loss hides the stale clock, preserves the saved seat, and confirms recovery',async()=>{
 const ui=boot(),host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:2,total:2,players:['Junior','Andre'],state:E.fresh(['Junior','Andre']),votes:[],deadline:ui.now()+10000,serverNow:ui.now()};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>({...host})});ui.start();await new Promise(setImmediate);
 ui.setResponse(Error('Network offline'));await ui.poll();A.equal(ui.get('connectionBadge').textContent,'Reconnecting…');A.equal(ui.get('turnClock').hidden,true);A.equal(ui.get('roll').disabled,true);A.ok(ui.storage.has('jv-ludi-room-v1'));
 ui.setResponse({ok:true,json:async()=>({...host})});await ui.poll();A.equal(ui.get('connectionBadge').textContent,'Back online');A.equal(ui.get('turnClock').hidden,false);A.equal(ui.get('roll').disabled,false);
 ui.advance(5001);ui.indicators();A.equal(ui.get('connectionBadge').textContent,'Connected');
 ui.events.offline();A.equal(ui.get('connectionBadge').textContent,'Reconnecting…');await ui.events.online();A.equal(ui.get('connectionBadge').textContent,'Back online');
});

test('overlapping reconnect polls do not create multiple requests',async()=>{
 const ui=boot(),host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:0,total:2,players:['Junior'],state:null,votes:[]};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>({...host})});ui.start();await new Promise(setImmediate);
 let release,calls=0;ui.setResponse(()=>{calls++;return new Promise(resolve=>release=resolve)});
 const pending=ui.poll();await ui.poll();A.equal(calls,1);release({ok:true,json:async()=>({...host})});await pending;
});

test('winner panel shows every online rematch vote and resets only after unanimous consent',async()=>{
 const ui=boot(),game=E.fresh(['Junior','Andre']);game.players[0].tokens.fill(E.HOME);game.phase='over';game.winner=0;
 const host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:5,total:2,players:['Junior','Andre'],state:game,votes:[],deadline:null};
 ui.get('mode').value='online';ui.setResponse({ok:true,json:async()=>({...host})});ui.start();await new Promise(setImmediate);
 A.equal(ui.get('winnerPanel').hidden,false);A.equal(ui.get('winnerTitle').textContent,'Junior wins!');A.equal(ui.get('turnClock').hidden,true);A.equal(ui.get('newGame').hidden,true);A.equal(ui.get('quickControls').hidden,true);
 A.equal(ui.get('rematchVotes').children.length,2);A.equal(ui.get('rematchVotes').children[1].children[1].textContent,'Waiting');
 ui.setResponse({ok:true,json:async()=>({...host,version:6,votes:[0]})});await ui.get('rematch').onclick();A.equal(ui.lastBody().type,'rematch');A.equal(ui.get('rematch').disabled,true);A.equal(ui.get('rematchVotes').children[0].children[1].textContent,'Ready');A.match(ui.get('rematchStatus').textContent,/1 of 2/);A.equal(ui.get('winnerPanel').hidden,false);
 ui.setResponse({ok:true,json:async()=>({...host,version:7,state:E.fresh(['Junior','Andre']),votes:[],deadline:ui.now()+10000,serverNow:ui.now()})});await ui.poll();A.equal(ui.get('winnerPanel').hidden,true);A.equal(ui.get('turnClock').textContent,'10s');A.equal(ui.get('roll').disabled,false);
});

test('same-device and computer wins show a play-again screen with no running clock',()=>{
 for(const mode of ['local','ai']){
  const ui=boot((g,seat,a)=>{if(a.type==='roll'){g.players[0].tokens=[E.HOME,E.HOME,E.HOME,E.HOME-1]}return [1,1]});
  ui.get('mode').value=mode;ui.start();ui.get('roll').onclick();ui.tick();ui.get('moves').children[0].onclick();
  A.equal(ui.get('winnerPanel').hidden,false);A.equal(ui.get('turnClock').hidden,true);A.equal(ui.get('rematchVotes').hidden,true);A.equal(ui.get('rematch').textContent,'Play again');
  A.equal(ui.timeouts.size,0);ui.get('rematch').onclick();A.equal(ui.get('winnerPanel').hidden,true);A.equal(ui.get('turnClock').textContent,'10s');
 }
});

test('guided tutorial completes all five steps without timers or online records and opens practice',()=>{
 const ui=boot([6,3]);ui.get('learn').onclick();A.equal(ui.get('tutorialPanel').hidden,false);A.equal(ui.get('turnClock').hidden,true);A.equal(ui.timeouts.size,0);
 ui.get('roll').onclick();ui.tick();ui.get('moves').children[0].onclick();A.match(ui.get('tutorialStep').textContent,/STEP 2/);
 ui.get('moves').children[0].onclick();A.match(ui.get('tutorialStep').textContent,/STEP 3/);
 ui.get('moves').children[0].onclick();A.match(ui.get('tutorialStep').textContent,/STEP 4/);
 ui.get('moves').children[0].onclick();A.match(ui.get('tutorialStep').textContent,/STEP 5/);
 ui.get('moves').children[0].onclick();A.equal(ui.get('tutorialStep').textContent,'PRACTICE COMPLETE');A.equal(ui.get('winnerPanel').hidden,true);A.equal(ui.timeouts.size,0);A.equal(ui.lastBody(),undefined);
 ui.get('tutorialPractice').onclick();A.equal(ui.get('tutorialPanel').hidden,true);A.equal(ui.get('mode').value,'ai');A.equal(ui.get('turnClock').textContent,'10s');
});

test('public matchmaking creates a saved player, shows a cancelable search, and hides private invite controls',async()=>{
 const ui=boot(),host={code:'ABCDEF12',token:'a'.repeat(64),you:0,version:0,total:2,players:['Junior'],state:null,votes:[],publicTable:true};
 ui.setResponse({ok:true,json:async()=>({...host})});await ui.get('publicPlay').onclick();A.equal(ui.get('begin').textContent,'Play online');
 A.equal(ui.lastBody().type,'find');A.equal(ui.lastBody().profileId,'b'.repeat(32));A.ok(ui.storage.has('jv-ludi-player-v1'));A.match(ui.get('connection').textContent,/Finding players/);A.equal(ui.get('leave').textContent,'Cancel search');A.equal(ui.get('copy').hidden,true);A.equal(ui.get('startOnline').hidden,true);
 ui.setResponse({ok:true,json:async()=>({cancelled:true})});await ui.get('leave').onclick();A.equal(ui.lastBody().type,'cancel');A.equal(ui.get('setup').hidden,false);A.equal(ui.storage.has('jv-ludi-room-v1'),false);
});

test('saved profile displays verified counts and a recoverable identity without showing its secret by default',async()=>{
 const ui=boot();ui.get('recoveryBox').hidden=true;await ui.get('saveProfile').onclick();A.match(ui.get('playerSummary').textContent,/Junior.*0 wins.*0 games/);A.equal(ui.get('recoveryBox').hidden,true);A.ok(ui.storage.has('jv-ludi-player-v1'));
 ui.get('showRecovery').onclick();A.equal(ui.get('recoveryBox').hidden,false);A.match(ui.get('recoveryCode').value,/^[a-f0-9]{32}\.[a-f0-9]{64}$/);
 ui.get('recoverCode').value='invalid';await ui.get('recoverForm').onsubmit({preventDefault(){}});A.match(ui.get('profileMessage').textContent,/complete recovery code/);
});
