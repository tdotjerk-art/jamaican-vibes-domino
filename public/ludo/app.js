(()=>{
 'use strict';
 const E=JVLudo,$=id=>document.getElementById(id),svgNS='http://www.w3.org/2000/svg';
 const seatKey='jv-ludo-room-v1',nameKey='jv-draff-player-name-v1';
 let local=null,room=null,token=null,version=-1,busy=false,epoch=0,poll=null,aiTimer=null,message='';
 function saved(){try{const r=JSON.parse(localStorage.getItem(seatKey)||'null');return r&&/^[A-F0-9]{8}$/.test(r.code)&&/^[a-f0-9]{64}$/.test(r.token)?r:null}catch{return null}}
 function save(r){try{if(r)localStorage.setItem(seatKey,JSON.stringify({code:r.code,token:r.token}));else localStorage.removeItem(seatKey)}catch{}}
 function name(){const n=E.cleanName($('name').value);if(!n)throw Error('Enter your name to play.');try{localStorage.setItem(nameKey,n)}catch{}return n}
 function count(){const n=Number($('count').value);if(!Number.isInteger(n)||n<2||n>4)throw Error('Choose 2, 3, or 4 players.');return n}
 function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el}
 function svg(tag,attrs,parent=$('board'),text){const el=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;parent.append(el);return el}
 function snapshot(){return local||room?.state||null}
 function yourTurn(g){return !!g&&!busy&&(local?($('mode').value==='local'||g.turn===0):room.you===g.turn)}
 // Keep the board at 600 units: six 35-unit cells, a 180-unit centre,
 // then six more 35-unit cells. The centre was previously 120 units wide.
 const edge=n=>n<=6?n*35:n<=9?210+(n-6)*60:390+(n-9)*35;
 const middle=n=>(edge(n)+edge(n+1))/2;
 function board(g){
  const root=$('board');root.replaceChildren();
  svg('rect',{x:0,y:0,width:600,height:600,fill:'#101611'});
  const corners=[[0,0],[390,0],[390,390],[0,390]],yardScale=0.875;
  for(let c=0;c<4;c++){
   const [x,y]=corners[c],team=E.TEAMS[c];
   svg('rect',{x:x+9,y:y+9,width:192,height:192,rx:9,fill:'#101b14',stroke:c===1?'#9c995d':team.color,'stroke-width':2});
   svg('text',{x:x+105,y:y+(c<2?34:193),fill:'#fed100','font-size':18,'font-weight':850,'text-anchor':'middle','letter-spacing':1.5},root,team.name.toUpperCase());
   svg('text',{x:x+105,y:y+136,fill:team.color,opacity:.16,'font-size':96,'text-anchor':'middle'},root,'★');
   for(let p=0;p<4;p++)svg('circle',{cx:x+(78+(p%2)*84)*yardScale,cy:y+(80+Math.floor(p/2)*70)*yardScale,r:22,fill:'#080d09',stroke:'#48664c','stroke-width':1.5});
  }
  E.TRACK.forEach(([r,c],i)=>{
   const start=E.TEAMS.findIndex(t=>t.start===i),safe=E.SAFE.includes(i);
   svg('rect',{x:edge(c),y:edge(r),width:edge(c+1)-edge(c),height:edge(r+1)-edge(r),fill:['#067436','#101611','#e9c628'][i%3],stroke:'#eee1b6','stroke-width':1});
   if(safe)svg('text',{x:middle(c),y:middle(r)+7,'text-anchor':'middle',fill:i%3===2?'#142b1c':'#fed100','font-size':23},root,start<0?'★':'');
   if(start>=0){svg('circle',{cx:middle(c),cy:middle(r),r:15,fill:'none',stroke:'#fed100','stroke-width':2.5});svg('text',{x:middle(c),y:middle(r)+7,'text-anchor':'middle',fill:'#fff5c9','font-size':22,transform:`rotate(${[0,90,180,-90][start]} ${middle(c)} ${middle(r)})`},root,'➜');}
  });
  for(let color=0;color<4;color++)for(let step=51;step<56;step++){
   const [r,c]=E.coordinate({color},step),team=E.TEAMS[color];
   svg('rect',{x:edge(c),y:edge(r),width:edge(c+1)-edge(c),height:edge(r+1)-edge(r),fill:color===3?'#d4b92b':color===1?'#1c2b23':'#075c31',stroke:'#ede0ae','stroke-width':1});
   svg('text',{x:middle(c),y:middle(r)+6,'text-anchor':'middle',fill:color===3?'#162719':'#fed100','font-size':15},root,String(step-50));
  }
  const center=svg('g',{id:'ludo-center','aria-label':'Jamaica Land We Love'});
  svg('rect',{x:210,y:210,width:180,height:180,fill:'#080e09',stroke:'#fed100','stroke-width':1.5},center);
  svg('image',{href:'/ludo/assets/hummingbird.png',x:216,y:215,width:168,height:140,preserveAspectRatio:'xMidYMid meet','aria-label':'Jamaican hummingbird'},center);
  svg('text',{x:300,y:370,fill:'#fed100','font-size':14,'font-weight':850,'letter-spacing':1.7,'text-anchor':'middle'},center,'JAMAICA');
  svg('text',{x:300,y:384,fill:'#fed100','font-size':10.5,'font-weight':750,'letter-spacing':1,'text-anchor':'middle'},center,'LAND WE LOVE');
  const view=g||E.fresh(E.TEAMS.map(t=>t.name)),allowed=g&&yourTurn(g)?E.legal(g).map(m=>m.piece):[];
  const pieces=[];
  view.players.forEach((p,seat)=>p.tokens.forEach((progress,piece)=>{
   let pos;
   if(progress<0){const [x,y]=corners[p.color];pos=[x+(78+(piece%2)*84)*yardScale,y+(80+Math.floor(piece/2)*70)*yardScale]}
   else if(progress===E.HOME){const centers=[[255,300],[300,255],[345,300],[300,330]],center=centers[p.color];pos=[center[0]+(piece%2?12:-12),center[1]+(piece<2?-12:12)]}
   else{const [r,c]=E.coordinate(p,progress);pos=[middle(c),middle(r)]}
   pieces.push({p,seat,piece,progress,pos});
  }));
  for(const piece of pieces){
   let [x,y]=piece.pos;const group=pieces.filter(other=>other.pos[0]===x&&other.pos[1]===y),n=group.length,index=group.indexOf(piece);
   let radius=piece.progress<0?18:piece.progress===E.HOME?12:14;
   if(n>1){const cols=n===2?2:Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols);const gap=n>4?10:12;x+=(index%cols-(cols-1)/2)*gap;y+=(Math.floor(index/cols)-(rows-1)/2)*gap;radius=n>4?5:n>2?7:10}
   const playable=!!g&&g.turn===piece.seat&&allowed.includes(piece.piece),team=E.TEAMS[piece.p.color];
   const tokenNode=svg('g',{class:'ludo-token'+(playable?' playable':''),role:'button',tabindex:playable?0:-1,'aria-disabled':!playable,'aria-label':piece.p.name+', piece '+(piece.piece+1)+(piece.progress<0?', in yard':piece.progress===E.HOME?', home':', on board')});
   svg('circle',{cx:x,cy:y+2,r:radius,fill:'#0008'},tokenNode);
   svg('circle',{cx:x,cy:y,r:radius,fill:team.color,stroke:piece.p.color===3?'#111c14':'#edcf58','stroke-width':2},tokenNode);
   svg('text',{x,y:y+radius*.36,'text-anchor':'middle',fill:piece.p.color===3?'#122719':'#fff4d2','font-size':radius*1.05,'font-weight':800},tokenNode,String(piece.piece+1));
   if(playable){tokenNode.onclick=()=>action({type:'move',piece:piece.piece});tokenNode.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action({type:'move',piece:piece.piece})}}}
  }
 }
 function moveButtons(parent,g){
  parent.replaceChildren();if(!g||!yourTurn(g))return;
  for(const m of E.legal(g)){const button=node('button','Piece '+(m.piece+1)+(m.to===E.HOME?' · home':m.from<0?' · enter':''));button.onclick=()=>action({type:'move',piece:m.piece});parent.append(button)}
 }
 function render(){
  clearTimeout(aiTimer);const g=snapshot(),active=!!(local||room);document.body.classList.toggle('in-game',!!g);
  $('setup').hidden=active;$('gamePanel').hidden=!active;$('joinControls').hidden=$('mode').value!=='online';$('begin').textContent=$('mode').value==='online'?'Create online room':'Start game ↗';$('resume').hidden=!saved();
  $('begin').disabled=busy;$('join').disabled=busy;$('resume').disabled=busy;$('leave').disabled=busy;
  $('roomInfo').hidden=!room;$('roomCode').textContent=room?.code||'';$('modeLabel').textContent=room?'ONLINE TABLE':$('mode').value==='local'?'SAME DEVICE':'VS COMPUTERS';
  $('connection').textContent=message|| (room?!g?'Share your room code · '+room.players.length+' of '+room.total+' players joined.':room.votes.length?(room.votes.includes(room.you)?'New game requested. Waiting for everyone.':'A new game was requested. Press Request new game to agree.'):'Connected · your seat is saved in this browser.':'');
  $('startOnline').hidden=!room||!!g||room.you!==0;$('startOnline').disabled=busy||!room||room.players.length!==room.total;
  $('newGame').hidden=!g;$('newGame').disabled=busy;$('newGame').textContent=room?'Request new game':'New game';
  $('playControls').hidden=!g;$('quickControls').hidden=!g;
  $('turnBanner').textContent=!active?'Welcome to the table.':!g?'Waiting for players…':g.phase==='over'?g.players[g.winner].name+' wins!':g.players[g.turn].name+($('mode').value==='ai'&&g.turn!==0?' is thinking…':g.phase==='move'?' · choose a piece':' · roll the dice');
  $('seats').replaceChildren();
  const seats=g?g.players:room?.players.map((name,i)=>({name,color:room.total===2?i*2:i,tokens:[]}))||[];
  seats.forEach((p,i)=>{const el=node('div',undefined,'seat'+(g&&g.phase!=='over'&&g.turn===i?' active':'')),label=node('span',undefined,'seat-name'),dot=node('i');dot.style.background=E.TEAMS[p.color].color;label.append(dot,node('span',p.name+(room?.you===i?' (you)':'')));el.append(label,node('small',g?p.tokens.filter(n=>n===E.HOME).length+'/4 home':E.TEAMS[p.color].name));$('seats').append(el)});
  const canRoll=!!g&&yourTurn(g)&&g.phase==='roll';$('roll').disabled=!canRoll;$('quickRoll').disabled=!canRoll;
  $('dice').textContent=g?.die?['','⚀','⚁','⚂','⚃','⚄','⚅'][g.die]:'⚄';$('dice').setAttribute('aria-label',g?.die?'Last roll: '+g.die:'Dice not rolled');
  $('diceLabel').textContent=g?.die?'Last roll · '+g.die:'Roll to begin.';$('quickRoll').textContent=g?.die?'Roll dice · '+g.die:'Roll dice';
  $('hint').textContent=!g?'':g.phase==='over'?'All four pieces are home. Start another game.':g.phase==='move'?(yourTurn(g)?'Tap a numbered piece or choose one below.':'Waiting for '+g.players[g.turn].name+' to move.'):'Roll a six to enter. Safe squares are marked ★.';
  moveButtons($('moves'),g);moveButtons($('quickMoves'),g);
  $('history').replaceChildren();(g?.history||[]).slice(-5).reverse().forEach(text=>$('history').append(node('p',text)));
  board(g);scheduleComputer();
 }
 function scheduleComputer(){
  const g=local;if(!g||$('mode').value!=='ai'||g.turn===0||g.phase==='over')return;
  aiTimer=setTimeout(()=>{
   if(g!==local)return;
   if(g.phase==='roll')local=E.act(g,g.turn,{type:'roll'});
   else{
    const choices=E.legal(g).map(m=>{const next=E.act(g,g.turn,{type:'move',piece:m.piece});return {m,score:(m.to===E.HOME?1000:0)+(next.last.captured.length*200)+(m.from<0?45:m.to)+Math.random()}}).sort((a,b)=>b.score-a.score);
    if(choices.length)local=E.act(g,g.turn,{type:'move',piece:choices[0].m.piece});
   }
   render();
  },g.phase==='roll'?1400:1100);
 }
 function action(a){const g=snapshot();if(!g||!yourTurn(g))return;if(local){try{local=E.act(local,local.turn,a);$('error').textContent='';render()}catch(e){$('error').textContent=e.message}}else send(a)}
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
 function startLocal(){const n=count(),player=name();local=E.fresh(Array.from({length:n},(_,i)=>i===0?player:$('mode').value==='ai'?E.TEAMS[n===2?2:i].name+' · Computer':'Player '+(i+1)));render()}
 $('setupForm').onsubmit=e=>{e.preventDefault();if($('mode').value==='online')enter('create');else try{startLocal();$('error').textContent=''}catch(error){$('error').textContent=error.message}};
 $('mode').onchange=()=>{message='';$('error').textContent='';render()};$('join').onclick=()=>enter('join');$('resume').onclick=resume;
 $('startOnline').onclick=()=>send({type:'start'});$('roll').onclick=$('quickRoll').onclick=()=>action({type:'roll'});
 $('newGame').onclick=()=>{if(room)send({type:'rematch'});else if(confirm('Start a new Ludo game? The current board will be cleared.'))startLocal()};
 $('leave').onclick=()=>{if(!confirm('Leave this table? Online players can return using this browser’s saved room.'))return;epoch++;clearTimeout(aiTimer);clearInterval(poll);local=null;room=null;token=null;version=-1;busy=false;message='';$('error').textContent='';render()};
 $('copy').onclick=async()=>{if(!room)return;const link=new URL('/ludo/',location.origin);link.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(link.href);message='Invite link copied.'}catch{message='Share room code: '+room.code}render()};
 try{$('name').value=E.cleanName(localStorage.getItem(nameKey))}catch{}
 const invite=new URL(location.href).searchParams.get('room');if(invite){$('mode').value='online';$('code').value=invite.toUpperCase()}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});render();
 if(invite&&saved()?.code===invite.toUpperCase())resume();
})();
