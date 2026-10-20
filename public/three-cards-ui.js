(()=>{
 'use strict';
 const $=id=>document.getElementById(id),E=JVThreeCards;
 let local=null,remote=null,socket=null,timer=null,match=null,other=null,key='',last='';
 const saved=()=>{try{return JSON.parse(localStorage.getItem('jv-three-seat')||'null');}catch{return null;}};
 function remember(value){try{if(value)localStorage.setItem('jv-three-seat',JSON.stringify(value));else localStorage.removeItem('jv-three-seat');}catch{}}
 function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
 function card(c,click,selected=false){const el=node(click?'button':'span',undefined,'card'+(c&&'♥♦'.includes(c.suit)?' red':'')+(c?'':' back')+(selected?' selected':''));el.setAttribute('aria-label',c?E.face(c):'Hidden card');if(c){el.append(node('span',E.face(c).slice(0,-1)),node('span',c.suit));}else el.textContent='✦';if(click){el.onclick=click;el.setAttribute('aria-pressed',String(selected));}return el;}
 function button(text,fn,disabled=false,cls=''){const b=node('button',text,cls);b.disabled=disabled;b.onclick=fn;$('actions').append(b);return b;}
 function total(id){const v=Number($(id).value);if(!Number.isInteger(v)||v<5||v%5||v>1000)throw Error('Choose 5, 10, 15 games or another multiple of 5 (up to 1000).');return v;}
 function error(message){$('error').textContent=message;}
 function act(type,data={}){error('');if(local){const g=local;let ok=false;if(type==='pick')ok=g.pick(0);if(type==='deal')ok=g.deal(0);if(type==='declare')ok=g.declare(0,data.claim);if(type==='draw')ok=g.draw(0);if(type==='pass')ok=g.pass(0);if(type==='play')ok=g.play(0,data.match,data.other);if(type==='next')ok=g.next();if(ok)render();}else socket?.emit('action',{type,...data});}
 function connect(){
  if(socket)return socket;if(typeof io!=='function')throw Error('Online connection unavailable. Refresh and try again.');
  socket=io('/three-cards');
  socket.on('assigned',remember);
  socket.on('state',r=>{remote=r;render();});
  socket.on('card-error',m=>{error(m);if(/no longer available/.test(m))remember(null);});
  socket.on('disconnect',()=>{if(remote){error('Connection lost. Reconnecting…');render();}});
  socket.on('connect',()=>{error('');const seat=saved();if(seat)socket.emit('resume',seat);});return socket;
 }
 function render(){
  clearTimeout(timer);const online=!local&&remote,g=local?local.view(0):online?.game,seat=online?remote.seat:0;
  $('setup').hidden=!!(local||remote);$('lobby').hidden=!(online&&!g);$('game').hidden=!g;$('leave').hidden=!(local||remote);
  if(online&&!g){
   $('roomCode').textContent=remote.code;$('seatList').replaceChildren();remote.seats.forEach((p,i)=>$('seatList').append(node('p',`${p.name}${i===seat?' (you)':''} · ${p.total} games · ${p.connected?(p.ready?'Ready':'Choosing'):'Disconnected'}`)));
   if(document.activeElement!==$('lobbyTotal'))$('lobbyTotal').value=remote.seats[seat].total;
   $('ready').textContent=remote.seats[seat].ready?'Not ready':'Ready';$('start').hidden=seat!==0;
   $('start').disabled=remote.seats.length<2||remote.seats.length>4||!remote.seats.every(p=>p.connected&&p.ready&&p.total===remote.seats[0].total);return;
  }
  if(!g)return;
  const stateKey=[g.phase,g.turn,g.top?.id,g.players[seat].hand.map(c=>c.id).join(',')].join('|');if(key!==stateKey){key=stateKey;match=null;other=null;}
  const paused=online&&(!socket.connected||remote.seats.some(p=>!p.connected));
  $('progress').textContent=`Game ${Math.min(g.completed+(!['hand-over','session-over'].includes(g.phase)?1:0),g.total)} of ${g.total}`;
  $('modeLabel').textContent=online?'ROOM '+remote.code:'VS COMPUTERS';
  $('players').replaceChildren();g.players.forEach((p,i)=>{const relative=(i-seat+g.players.length)%g.players.length;const position=relative===0?'south':g.players.length===2?'north':g.players.length===3?(relative===1?'east':'west'):['south','east','north','west'][relative];const el=node('article',undefined,'player seat-'+position+(g.turn===i?' active':''));el.append(node('h3',p.name+(i===seat?' · YOU':'')),node('div',E.scoreText(p.score),'score'),node('p',(g.dealer===i?'Dealer · ':'')+p.count+(p.count===1?' card':' cards')));
   if(g.phase==='declare')el.append(node('p',g.declarations[i]===null?'Choosing call…':'Ready'));
   if(['pick','deal'].includes(g.phase)){const wrap=node('div',undefined,'cards small');wrap.append(g.picks[i]?card(g.picks[i]):card(null));el.append(wrap);}
   if(i!==seat&&!['pick','deal'].includes(g.phase)&&p.count){const backs=node('div',undefined,'cards small');for(let n=0;n<p.count;n++)backs.append(card(null));el.append(backs);}if(g.phase==='session-over')el.append(node('p',p.score>0?'WINNER':p.score<0?'LOSS':'EVEN'));$('players').append(el);});
  $('tableCard').replaceChildren(card(g.top));$('remaining').textContent=g.top?g.remaining+' cards in deck'+(g.bonus?' · Dealer bonus +'+g.bonus:''):'';
  $('tableCard').classList.toggle('stacked',(g.recent||[]).length>1);
  const hand=g.players[seat].hand;$('yourHand').replaceChildren(node('h3','YOUR HAND'));
  const cards=node('div',undefined,'cards');const canPlay=g.phase==='offer'&&g.turn===seat&&!paused;const pairWin=E.pairWin(hand,g.top?.rank);
  hand.forEach(c=>{const click=canPlay?()=>{if(match===c.id){match=null;other=null;}else if(!match){if(c.rank!==g.top.rank){error('Choose a card matching '+E.face(g.top)+' first.');return;}match=c.id;other=null;}else other=other===c.id?null:c.id;render();}:null;cards.append(card(c,click,match===c.id||other===c.id));});$('yourHand').append(cards);
  $('message').textContent=paused?'Play paused. Waiting for every player to reconnect.':g.message;
  $('actions').replaceChildren();$('hint').textContent='Chances and draws move to the right. Matching plays use ranks; suits count for flush calls.';
  if(!paused){
   if(g.phase==='pick'){
    const eligible=g.pickSeats.includes(seat)&&!g.picks[seat];button('Pick your dealer card',()=>act('pick'),!eligible);$('hint').textContent='Highest card deals. Ace is high. Tied highest players pick again.';
   }else if(g.phase==='deal'){button('Shuffle & deal 3 cards',()=>act('deal'),g.dealer!==seat);}
   else if(g.phase==='declare'){
    const call=E.evaluateCall(hand),waiting=g.declarations[seat]===null;
    button(call?'Declare '+call.name+' · '+call.points+' each':'No qualifying call',()=>act('declare',{claim:true}),!waiting||!call);
    button('Pass call',()=>act('declare',{claim:false}),!waiting,'quiet');
    $('hint').textContent=waiting?'Declare your strongest call or pass. Play starts after everyone decides.':'Your choice is recorded. Waiting for the other players.';
   }
   else if(g.phase==='draw'){button('Draw one card',()=>act('draw'),g.turn!==seat);$('hint').textContent=g.turn===seat?'The card stays on the table. You get first choice to use it.':'Waiting for '+g.players[g.turn].name+' to draw.';}
   else if(g.phase==='offer'&&g.turn===seat){
    button(pairWin?'Clear all three & win':hand.length===1?'Play last card & win':'Play selected cards',()=>act('play',{match,other}),!match||(hand.length>1&&!pairWin&&!other));button('Decline — let it go around',()=>act('pass'),false,'quiet');
    $('hint').textContent=pairWin?'You have a pair. Tap your other card, then play it to win. All three cards clear when you win.':hand.length===1?'Tap your matching card, then play it to win.':!match?'Tap your matching '+E.face(g.top).slice(0,-1)+', then choose one other card.':!other?'Now choose another card from your hand.':'Play both selected cards. The second card becomes the rank to match.';
   }else if(g.phase==='hand-over'){button('Next game',()=>act('next'));}
  }
  $('callResult').textContent=g.callSummary?(g.callSummary.name?g.callSummary.winners.map(i=>g.players[i].name).join(' & ')+(g.callSummary.tied?' share ':' won ')+g.callSummary.name+' · '+g.callSummary.deltas.map((delta,i)=>g.players[i].name+' '+E.scoreText(delta)).join(' · '):'No calls declared this hand.'):'';
  $('extension').hidden=g.phase!=='session-over';$('extensionVotes').replaceChildren();
  if(g.phase==='session-over'&&online)remote.seats.forEach(p=>$('extensionVotes').append(node('p',p.name+': '+(p.extension?'add '+p.extension+' games':'deciding'))));
  $('log').replaceChildren();g.history.forEach(text=>$('log').append(node('li',text)));
  if(local&&!$('rules').open)scheduleComputer();
 }
 function scheduleComputer(){
  let seat=null;const g=local;if(!g)return;
  if(g.phase==='pick')seat=g.pickSeats.find(i=>i!==0&&!g.picks[i]);else if(g.phase==='deal'&&g.dealer!==0)seat=g.dealer;else if(g.phase==='declare')seat=g.declarations.findIndex((value,i)=>i!==0&&value===null);else if(['offer','draw'].includes(g.phase)&&g.turn!==0)seat=g.turn;
  if(seat===undefined||seat===null||seat<0)return;
  timer=setTimeout(()=>{if(g!==local)return;if(g.phase==='pick')g.pick(seat);else if(g.phase==='deal')g.deal(seat);else if(g.phase==='declare')g.declare(seat,!!E.evaluateCall(g.players[seat].hand));else if(g.phase==='draw')g.draw(seat);else{const hand=g.players[seat].hand,m=hand.find(c=>c.rank===g.pile.at(-1).rank),o=hand.find(c=>c!==m);g.play(seat,m.id,o?.id);}render();},1600);
 }
 $('solo').onclick=()=>{try{const count=Number($('count').value);if(!Number.isInteger(count)||count<2||count>4)throw Error('Choose 2, 3, or 4 players.');const names=['You','Andre','Simone','Winston'].slice(0,count);names[0]=$('name').value.trim().slice(0,20)||'You';local=new E.Game(names,total('total'));render();}catch(e){error(e.message);}};
 for(const type of ['create','join'])$(type).onclick=()=>{try{const name=$('name').value.trim();if(!name)throw Error('Enter your name.');const data={name,total:total('total'),code:$('code').value};remember(null);const s=connect();if(s.connected)s.emit(type,data);else s.once('connect',()=>s.emit(type,data));}catch(e){error(e.message);}};
 $('lobbyTotal').onchange=()=>{try{socket.emit('choice',{total:total('lobbyTotal')});}catch(e){error(e.message);}};
 $('ready').onclick=()=>socket.emit('ready');$('start').onclick=()=>socket.emit('start');
 $('extend').onclick=()=>{try{const amount=total('extra');if(local){if(!local.extend(amount))throw Error('Cannot extend this session beyond 1000 games.');render();}else socket.emit('extend',{amount});}catch(e){error(e.message);}};
 $('leave').onclick=()=>{if(!confirm('Leave this table? Single-player progress will end. An online table pauses until you return in this browser.'))return;clearTimeout(timer);if(socket){socket.disconnect();socket=null;}local=null;remote=null;render();};
 $('rulesBtn').onclick=()=>{clearTimeout(timer);$('rules').showModal();};$('closeRules').onclick=()=>$('rules').close();$('rules').addEventListener('close',()=>render());
 if(saved()){try{connect();}catch(e){error(e.message);}}render();
})();
