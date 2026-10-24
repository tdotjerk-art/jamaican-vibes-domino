(()=>{
 'use strict';
 const E=JVLudo,L=JVLudiLayout,$=id=>document.getElementById(id),svgNS='http://www.w3.org/2000/svg';
 const seatKey='jv-ludo-room-v1',nameKey='jv-draff-player-name-v1';
 let local=null,room=null,token=null,version=-1,busy=false,epoch=0,poll=null,aiTimer=null,message='',selectedDie=null,rolling=false,rollTimer=null,shownRollNo=0;
 function saved(){try{const r=JSON.parse(localStorage.getItem(seatKey)||'null');return r&&/^[A-F0-9]{8}$/.test(r.code)&&/^[a-f0-9]{64}$/.test(r.token)?r:null}catch{return null}}
 function save(r){try{if(r)localStorage.setItem(seatKey,JSON.stringify({code:r.code,token:r.token}));else localStorage.removeItem(seatKey)}catch{}}
 function name(){const n=E.cleanName($('name').value);if(!n)throw Error('Enter your name to play.');try{localStorage.setItem(nameKey,n)}catch{}return n}
 function count(){const n=Number($('count').value);if(!Number.isInteger(n)||n<2||n>4)throw Error('Choose 2, 3, or 4 players.');return n}
 function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el}
 function svg(tag,attrs,parent=$('board'),text){const el=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;parent.append(el);return el}
 function snapshot(){return local||room?.state||null}
 function yourTurn(g){return !!g&&!busy&&!rolling&&(local?($('mode').value==='local'||g.turn===0):room.you===g.turn)}
 const {edge,middle}=L;
 function pieceGradients(){
  const defs=svg('defs',{});
  for(let color=0;color<4;color++){
   const gradient=svg('radialGradient',{id:'ludi-gem-'+color,cx:'36%',cy:'28%',r:'72%'},defs),stops=[['#65c957','#087032','#023e1c'],['#ff6969','#c92128','#74090d'],['#687067','#22271f','#060907'],['#ffe779','#d6ae19','#8c6a08']][color];
   for(let i=0;i<3;i++)svg('stop',{offset:[0,.55,1][i],'stop-color':stops[i]},gradient);
  }
 }
 function board(g){
  const root=$('board');root.replaceChildren();
  svg('rect',{x:0,y:0,width:600,height:600,fill:'#070a07'});
  for(const [color,x,y]of [[0,0,0],[1,edge(8),0],[2,edge(8),edge(8)],[3,0,edge(8)]]){
   svg('rect',{x,y,width:edge(5),height:edge(5),fill:E.TEAMS[color].color,stroke:'#eee7ce','stroke-width':2.2,'aria-label':E.TEAMS[color].name+' home'});
  }
  pieceGradients();
  E.TRACK.forEach(([r,c],i)=>{
   svg('rect',{x:edge(c),y:edge(r),width:edge(c+1)-edge(c),height:edge(r+1)-edge(r),fill:L.paint(r,c),stroke:'#eee7ce','stroke-width':2.2});
   const start=E.TEAMS.findIndex(t=>t.start===i);
   if(start>=0)svg('text',{x:middle(c),y:middle(r)+7,'text-anchor':'middle',fill:'#287a42','font-size':24,'font-weight':900,transform:`rotate(${[0,90,180,-90][start]} ${middle(c)} ${middle(r)})`},root,'➜');
  });
  for(let color=0;color<4;color++)for(let step=E.OUTER_LAST+1;step<E.HOME;step++){
   const [r,c]=E.coordinate({color},step);
   svg('rect',{x:edge(c),y:edge(r),width:edge(c+1)-edge(c),height:edge(r+1)-edge(r),fill:E.TEAMS[color].color,stroke:'#eee7ce','stroke-width':2.2});
  }
  const center=svg('g',{id:'ludo-center','aria-label':'Four-color center'});
  svg('rect',{x:200,y:200,width:200,height:200,fill:'#080e09',stroke:'#eee7ce','stroke-width':2.2},center);
  for(const [color,points]of [[0,'200,200 300,300 200,400'],[1,'200,200 400,200 300,300'],[2,'400,200 400,400 300,300'],[3,'200,400 300,300 400,400']])svg('polygon',{points,fill:E.TEAMS[color].color,'aria-label':E.TEAMS[color].name+' finish'},center);
  svg('path',{d:'M200 200L400 400M400 200L200 400',fill:'none',stroke:'#080e09','stroke-width':8},center);
  svg('path',{d:'M200 200L400 400M400 200L200 400',fill:'none',stroke:'#fed100','stroke-width':5,'aria-label':'Centered gold X'},center);
  const view=g||E.fresh(E.TEAMS.map(t=>t.name)),allowed=g&&yourTurn(g)?E.legal(g,selectedDie).map(m=>m.piece):[];
  const pieces=[];
  view.players.forEach((p,seat)=>p.tokens.forEach((progress,piece)=>{
   let pos;
   if(progress<0)pos=L.yard(p.color,piece);
   else if(progress===E.HOME)pos=L.finished(p.color,piece);
   else{const [r,c]=E.coordinate(p,progress);pos=[middle(c),middle(r)]}
   pieces.push({p,seat,piece,progress,pos});
  }));
  for(const piece of pieces){
   let [x,y]=piece.pos;const group=pieces.filter(other=>other.pos[0]===x&&other.pos[1]===y),n=group.length,index=group.indexOf(piece);
   let radius=piece.progress<0?(piece.p.color===0||piece.p.color===3?15.4:14.5):piece.progress===E.HOME?9:13;
   if(n>1){const cols=n===2?2:Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols);const gap=n>4?10:12;x+=(index%cols-(cols-1)/2)*gap;y+=(Math.floor(index/cols)-(rows-1)/2)*gap;radius=n>4?5:n>2?7:10}
   const playable=!!g&&g.turn===piece.seat&&allowed.includes(piece.piece),team=E.TEAMS[piece.p.color];
   const tokenNode=svg('g',{class:'ludo-token'+(playable?' playable':''),role:'button',tabindex:playable?0:-1,'aria-disabled':!playable,'aria-label':piece.p.name+', piece '+(piece.piece+1)+(piece.progress<0?', in yard':piece.progress===E.HOME?', home':', on board')});
   svg('circle',{cx:x,cy:y+2,r:radius,fill:'#0008'},tokenNode);
   svg('circle',{cx:x,cy:y,r:radius,fill:'url(#ludi-gem-'+piece.p.color+')',stroke:'#eee7ce','stroke-width':1},tokenNode);
   for(let facet=0;facet<8;facet++){
    const a=facet*Math.PI/4+.2*(piece.piece+1),b=a+Math.PI/4;
    svg('path',{d:`M${x} ${y}L${x+Math.cos(a)*radius} ${y+Math.sin(a)*radius}L${x+Math.cos(b)*radius} ${y+Math.sin(b)*radius}Z`,fill:facet%2?'#000':'#fff',opacity:facet%2?.16:.1},tokenNode);
   }
   svg('circle',{cx:x-radius*.2,cy:y-radius*.25,r:radius*.35,fill:'#fff',opacity:.07},tokenNode);
   if(playable){tokenNode.onclick=()=>action({type:'move',piece:piece.piece,die:selectedDie});tokenNode.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action({type:'move',piece:piece.piece,die:selectedDie})}}}
  }
 }
 function moveButtons(parent,g){
  parent.replaceChildren();if(!g||!yourTurn(g))return;
  for(const m of E.legal(g,selectedDie)){const button=node('button','Piece '+(m.piece+1)+' · '+m.value+(m.to===E.HOME?' · home':m.from<0?' · enter':''));button.onclick=()=>action({type:'move',piece:m.piece,die:m.die});parent.append(button)}
 }
 function syncRoll(g){
  if(!g||!g.rollNo){clearTimeout(rollTimer);rolling=false;shownRollNo=0;return;}
  if(g.rollNo===shownRollNo)return;
  shownRollNo=g.rollNo;rolling=true;clearTimeout(rollTimer);
  rollTimer=setTimeout(()=>{rolling=false;render()},950);
 }
 function drawDice(g){
  $('tableDice').hidden=!g;$('tableDice').className='table-dice'+(rolling?' rolling':'');
  const seat=g?(rolling?(g.last?.seat??g.turn):g.turn):0,color=g?.players[seat]?.color??0,ink=color===3?'#102519':'#fff4d0';
  const pips=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
  for(let die=0;die<2;die++){
   const button=$('tableDie'+die),value=g?.dice?.[die],used=!!value&&!g.remaining.includes(die),selectable=!!g&&yourTurn(g)&&E.legal(g,die).length>0;
   button.style.background=E.TEAMS[color].color;button.style.color=ink;button.style.borderColor=ink;
   button.replaceChildren();button.className='table-die'+(used?' used':'')+(g?.phase==='move'&&selectedDie===die?' chosen':'');
   button.disabled=!selectable;button.setAttribute('aria-pressed',String(g?.phase==='move'&&selectedDie===die));
   button.setAttribute('aria-label','Die '+(die+1)+(value?': '+value:' not rolled')+(used?', used':''));
   const face=node('span',undefined,'die-face');face.setAttribute('aria-hidden','true');
   for(let dot=0;dot<9;dot++)face.append(node('i',undefined,'pip'+((pips[value||0]||[]).includes(dot)?' on':'')));
   if(!value)face.append(node('span','?','unrolled'));button.append(face);
  }
  $('tableRoll').disabled=!g||!yourTurn(g)||g.phase!=='roll';$('tableRoll').textContent=rolling?'Rolling…':'Roll dice';
 }
 function render(){
  clearTimeout(aiTimer);const g=snapshot(),active=!!(local||room);syncRoll(g);const choices=g?E.legal(g):[];if(!choices.some(m=>m.die===selectedDie))selectedDie=choices[0]?.die??null;document.body.classList.toggle('in-game',!!g);
  $('setup').hidden=active;$('gamePanel').hidden=!active;$('joinControls').hidden=$('mode').value!=='online';$('begin').textContent=$('mode').value==='online'?'Create online room':'Start game ↗';$('resume').hidden=!saved();
  $('begin').disabled=busy;$('join').disabled=busy;$('resume').disabled=busy;$('leave').disabled=busy;
  $('roomInfo').hidden=!room;$('roomCode').textContent=room?.code||'';$('modeLabel').textContent=room?'ONLINE TABLE':$('mode').value==='local'?'SAME DEVICE':'VS COMPUTERS';
  $('connection').textContent=message|| (room?!g?'Share your room code · '+room.players.length+' of '+room.total+' players joined.':room.votes.length?(room.votes.includes(room.you)?'New game requested. Waiting for everyone.':'A new game was requested. Press Request new game to agree.'):'Connected · your seat is saved in this browser.':'');
  $('startOnline').hidden=!room||!!g||room.you!==0;$('startOnline').disabled=busy||!room||room.players.length!==room.total;
  $('newGame').hidden=!g;$('newGame').disabled=busy;$('newGame').textContent=room?'Request new game':'New game';
  $('playControls').hidden=!g;$('quickControls').hidden=!g;
  $('turnBanner').textContent=!active?'Welcome to the table.':!g?'Waiting for players…':g.phase==='over'?g.players[g.winner].name+' wins!':g.players[rolling?(g.last?.seat??g.turn):g.turn].name+(rolling?' · rolling two dice…':$('mode').value==='ai'&&g.turn!==0?' is thinking…':g.phase==='move'?' · choose a piece':' · roll the dice');
  $('seats').replaceChildren();
  const seats=g?g.players:room?.players.map((name,i)=>({name,color:room.total===2?i*2:i,tokens:[]}))||[];
  seats.forEach((p,i)=>{const el=node('div',undefined,'seat'+(g&&g.phase!=='over'&&g.turn===i?' active':'')),label=node('span',undefined,'seat-name'),dot=node('i');dot.style.background=E.TEAMS[p.color].color;label.append(dot,node('span',p.name+(room?.you===i?' (you)':'')));el.append(label,node('small',g?p.tokens.filter(n=>n===E.HOME).length+'/4 home':E.TEAMS[p.color].name));$('seats').append(el)});
  const canRoll=!!g&&yourTurn(g)&&g.phase==='roll';$('roll').disabled=!canRoll;$('quickRoll').disabled=!canRoll;
  const values=g?.dice?.every(Number.isInteger)?g.dice.join(' + '):'';
  $('diceLabel').textContent=values?'Last roll · '+values:'Roll both dice on the table.';$('quickRoll').textContent=rolling?'Rolling…':'Roll two dice';
  $('hint').textContent=!g?'':rolling?'Both dice are rolling on the table.':g.phase==='over'?'All four pieces are home. Start another game.':g.phase==='move'?(yourTurn(g)?'Use both dice when possible. Using die '+(selectedDie+1)+' ('+g.dice[selectedDie]+'). Tap the other unused die to change, then choose a piece.':'Waiting for '+g.players[g.turn].name+' to move.'):'Roll a six on either die to enter. Use each die once.';
  drawDice(g);moveButtons($('moves'),g);moveButtons($('quickMoves'),g);
  $('history').replaceChildren();(g?.history||[]).slice(-5).reverse().forEach(text=>$('history').append(node('p',text)));
  board(g);scheduleComputer();
 }
 function scheduleComputer(){
  const g=local;if(!g||rolling||$('mode').value!=='ai'||g.turn===0||g.phase==='over')return;
  aiTimer=setTimeout(()=>{
   if(g!==local)return;
   if(g.phase==='roll')local=E.act(g,g.turn,{type:'roll'});
   else{
    const choices=E.legal(g).map(m=>{const next=E.act(g,g.turn,{type:'move',piece:m.piece,die:m.die});return {m,score:(m.to===E.HOME?1000:0)+(next.last.captured.length*200)+(m.from<0?45:m.to)+Math.random()}}).sort((a,b)=>b.score-a.score);
    if(choices.length)local=E.act(g,g.turn,{type:'move',piece:choices[0].m.piece,die:choices[0].m.die});
   }
   render();
  },g.phase==='roll'?1400:1100);
 }
 function action(a){const g=snapshot();if(!g||!yourTurn(g))return;if(local){try{local=E.act(local,local.turn,a);$('error').textContent='';render()}catch(e){$('error').textContent=e.message}}else return send(a)}
 async function request(a,credentials=room?{code:room.code,token}:null){
  const response=await fetch('/api/ludo'+(a?'':'?code='+encodeURIComponent(credentials.code)),{method:a?'POST':'GET',headers:{'Content-Type':'application/json',...(credentials?.token?{Authorization:'Bearer '+credentials.token}:{})},...(a?{body:JSON.stringify({...a,...(credentials?{code:credentials.code,version}:{})})}:{})});
  const r=await response.json();if(!response.ok){const e=Error(r.error||'Unable to connect.');e.status=response.status;throw e}return r;
 }
 function receive(r,newToken){if(room&&r.code===room.code&&r.version<version)return;room=r;version=r.version;if(newToken)token=newToken;render()}
 function terminal(e){if([401,403,404].includes(e.status)){epoch++;room=null;token=null;version=-1;busy=false;clearInterval(poll);save(null);message='';$('error').textContent=e.message;render();return true}return false}
 function polling(){clearInterval(poll);poll=setInterval(refresh,1500)}
 async function refresh(){if(!room||busy||document.hidden)return;const generation=epoch;try{const r=await request(null);if(generation!==epoch)return;message='';receive(r)}catch(e){if(generation!==epoch)return;if(!terminal(e)){message='Connection interrupted. Reconnecting…';render()}}}
 async function send(a){
  if(busy||!room)return;const generation=epoch;busy=true;$('error').textContent='';render();
  try{const r=await request(a);if(generation===epoch){message='';receive(r)}}catch(e){if(generation!==epoch)return;if(!terminal(e)){$('error').textContent=e.message;try{const r=await request(null);if(generation===epoch)receive(r)}catch(error){if(generation===epoch)terminal(error)}}}
  finally{if(generation===epoch){busy=false;render()}}
 }
 async function enter(type){
  if(busy)return;let player,total;try{player=name();total=count()}catch(e){$('error').textContent=e.message;return}
  const generation=epoch;busy=true;message='';$('error').textContent='';render();
  try{const r=await request({type,name:player,total,...(type==='join'?{code:$('code').value.trim().toUpperCase()}: {})},null);if(generation!==epoch)return;token=r.token;save(r);version=-1;receive(r,r.token);polling()}
  catch(e){if(generation===epoch)$('error').textContent=e.message}finally{if(generation===epoch){busy=false;render()}}
 }
 async function resume(){
  const credentials=saved();if(!credentials||busy)return;const generation=epoch;busy=true;$('error').textContent='';render();
  try{const r=await request(null,credentials);if(generation!==epoch)return;$('mode').value='online';token=credentials.token;version=-1;message='';receive(r,credentials.token);polling()}
  catch(e){if(generation===epoch&&!terminal(e))$('error').textContent=e.message}finally{if(generation===epoch){busy=false;render()}}
 }
 function startLocal(){const n=count(),player=name();shownRollNo=0;local=E.fresh(Array.from({length:n},(_,i)=>i===0?player:$('mode').value==='ai'?E.TEAMS[n===2?2:i].name+' · Computer':'Player '+(i+1)));render()}
 $('setupForm').onsubmit=e=>{e.preventDefault();if($('mode').value==='online')enter('create');else try{startLocal();$('error').textContent=''}catch(error){$('error').textContent=error.message}};
 $('mode').onchange=()=>{message='';$('error').textContent='';render()};$('join').onclick=()=>enter('join');$('resume').onclick=resume;
 $('startOnline').onclick=()=>send({type:'start'});$('roll').onclick=$('quickRoll').onclick=$('tableRoll').onclick=()=>action({type:'roll'});
 for(let die=0;die<2;die++)$('tableDie'+die).onclick=()=>{const g=snapshot();if(g&&yourTurn(g)&&E.legal(g,die).length){selectedDie=die;render()}};
 $('newGame').onclick=()=>{if(room)send({type:'rematch'});else if(confirm('Start a new LUDI game? The current board will be cleared.'))startLocal()};
 $('leave').onclick=()=>{if(!confirm('Leave this table? Online players can return using this browser’s saved room.'))return;epoch++;clearTimeout(aiTimer);clearTimeout(rollTimer);rolling=false;clearInterval(poll);local=null;room=null;token=null;version=-1;busy=false;message='';$('error').textContent='';render()};
 $('copy').onclick=async()=>{if(!room)return;const link=new URL('/ludo/',location.origin);link.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(link.href);message='Invite link copied.'}catch{message='Share room code: '+room.code}render()};
 try{$('name').value=E.cleanName(localStorage.getItem(nameKey))}catch{}
 const invite=new URL(location.href).searchParams.get('room');if(invite){$('mode').value='online';$('code').value=invite.toUpperCase()}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});render();
 if(invite&&saved()?.code===invite.toUpperCase())resume();
})();
