var netRoom=null,netBusy=false,netTimer=null,netMessage='',netVersion=-1,netEpoch=0;
const savedKey='jv-draff-online-room-v1';
function savedRoom(){try{let r=JSON.parse(localStorage.getItem(savedKey)||'null');return r&&/^[A-Z2-9]{8}$/.test(r.code)&&/^[a-f0-9]{64}$/.test(r.token)?r:null}catch{return null}}
function remember(r){try{localStorage.setItem(savedKey,JSON.stringify({code:r.code,token:r.token}))}catch{}}
function netRender(){if(mode.value!=='online')return;$('onlinePanel').hidden=false;$('roomSetup').hidden=!!netRoom;$('roomInfo').hidden=!netRoom;$('level').disabled=true;$('createRoom').disabled=netBusy;$('joinRoom').disabled=netBusy;$('resumeRoom').hidden=!savedRoom();$('new').textContent='Request new game';$('new').disabled=netBusy||!netRoom||!netRoom.state.active;$('claim').disabled=netBusy||!netRoom||!netRoom.state.active||!!over||s!==netRoom.you||chain>=0;
 if(!netRoom){$('status').textContent='Online Draff';$('hint').textContent='Create a room, then share the invite link.';$('connection').textContent=netMessage||'Create a room or join a friend.';$('opponent').textContent='Opponent';$('you').textContent='Your seat';return;}
 $('codeLabel').textContent=netRoom.code;$('seatLabel').textContent=netRoom.you===1?'You are Gold':'You are Black';$('opponent').textContent=netRoom.you===1?'Opponent · Black':'You · Black';$('you').textContent=netRoom.you===1?'You · Gold':'Opponent · Gold';
 $('status').textContent=over||(!netRoom.state.active?'Waiting for opponent…':s===netRoom.you?'Your turn':'Opponent’s turn');
 $('connection').textContent=netMessage||(!netRoom.state.active?'Share this room’s invite link with your friend.':netRoom.state.rematch.length?(netRoom.state.rematch.includes(netRoom.you)?'New game requested. Waiting for your opponent.':'Your opponent requests a new game. Press Request new game to accept.'):'Connected · two-player room');
 $('hint').textContent=claiming?'Tap the opposing piece that missed a capture.':netRoom.state.notice|| (chain>=0?'Continue jumping with the same piece.':'Select a piece, then choose where to move.');
}
async function requestGame(a,credential=netRoom){let res=await fetch('/api/draff'+(a?'':'?code='+encodeURIComponent(credential.code)),{method:a?'POST':'GET',headers:{'Content-Type':'application/json',...(credential?.token?{Authorization:'Bearer '+credential.token}:{})},...(a?{body:JSON.stringify({...a,...(credential?{code:credential.code,version:netVersion}:{})})}:{})});let r=await res.json();if(!res.ok){let error=Error(r.error||'Unable to connect.');error.status=res.status;throw error;}return r;}
function receive(r,token){if(mode.value!=='online')return;if(netRoom&&r.code===netRoom.code&&r.version<netVersion)return;let changed=r.version!==netVersion;netRoom={...r,token:token||netRoom?.token};netVersion=r.version;b=r.state.b;s=r.state.s;chain=r.state.chain;last=r.state.last;over=r.state.over;busy=false;if(changed){showCapture(r.state.captureSquares||[]);selected=chain>=0&&s===r.you?chain:-1;claiming=false;}render();}
function roomError(error,credential){
 if([401,403,404].includes(error.status)){
  netEpoch++;netBusy=false;clearInterval(netTimer);netRoom=null;netVersion=-1;
  if(savedRoom()?.code===credential?.code){try{localStorage.removeItem(savedKey)}catch{}}
  netMessage=error.message;reset();
 }else{netMessage='Connection interrupted. Reconnecting…';netRender();}
}
async function refreshRoom(){
 if(mode.value!=='online'||!netRoom||netBusy||document.hidden)return;
 let epoch=netEpoch,credential=netRoom;
 try{let r=await requestGame(null,credential);if(epoch!==netEpoch)return;netMessage='';receive(r)}
 catch(e){if(epoch===netEpoch)roomError(e,credential)}
}
async function submitOnline(a){
 if(netBusy||!netRoom)return;let epoch=netEpoch,credential=netRoom;netBusy=true;netMessage='';netRender();
 try{let r=await requestGame(a,credential);if(epoch===netEpoch)receive(r)}
 catch(e){if(epoch!==netEpoch)return;netMessage=e.message;
  try{let r=await requestGame(null,credential);if(epoch===netEpoch)receive(r)}catch(error){if(epoch===netEpoch)roomError(error,credential)}
 }finally{if(epoch===netEpoch){netBusy=false;netRender()}}
}
async function enterRoom(type){
 if(netBusy)return;let epoch=netEpoch;netBusy=true;netMessage='';netRender();
 try{let r=await requestGame({type,...(type==='join'?{code:$('roomCode').value.trim().toUpperCase()}: {})},null);
  if(epoch!==netEpoch)return;remember(r);netVersion=-1;receive(r,r.token);startPolling();
 }catch(e){if(epoch===netEpoch)netMessage=e.message}finally{if(epoch===netEpoch){netBusy=false;netRender()}}
}
function startPolling(){clearInterval(netTimer);netTimer=setInterval(refreshRoom,1400);}
async function resume(){
 let saved=savedRoom();if(!saved||netBusy)return;let epoch=netEpoch;netBusy=true;netRender();
 try{let r=await requestGame(null,saved);if(epoch!==netEpoch)return;netVersion=-1;receive(r,saved.token);startPolling();netMessage='';}
 catch(e){if(epoch===netEpoch){if([401,403,404].includes(e.status))roomError(e,saved);else netMessage=e.message}}
 finally{if(epoch===netEpoch){netBusy=false;netRender()}}
}
const offlineClick=click;
click=function(i){if(mode.value!=='online')return offlineClick(i);if(netBusy||!netRoom||!netRoom.state.active||over||s!==netRoom.you)return;if(claiming){submitOnline({type:'huff',at:i});return;}let m=E.moves(b,s,chain).find(m=>m.from===selected&&m.to===i);if(m){submitOnline({type:'move',from:m.from,to:m.to});return;}if(chain<0){selected=Math.sign(b[i])===s?i:-1;render();}};
mode.onchange=()=>{netEpoch++;netBusy=false;clearInterval(netTimer);netRoom=null;netVersion=-1;netMessage='';$('onlinePanel').hidden=mode.value!=='online';$('new').disabled=false;$('new').textContent='New game ↗';reset();if(mode.value==='online')netRender();};
$('new').onclick=()=>{if(mode.value==='online'){submitOnline({type:'rematch'});return;}if(history.length||busy)$('confirm').showModal();else reset();};
$('createRoom').onclick=()=>enterRoom('create');$('joinRoom').onclick=()=>enterRoom('join');$('resumeRoom').onclick=resume;
$('copyRoom').onclick=async()=>{if(!netRoom)return;let url=new URL('/draff/',location.origin);url.searchParams.set('room',netRoom.code);try{await navigator.clipboard.writeText(url.href);netMessage='Invite link copied.';}catch{netMessage='Share room code: '+netRoom.code}netRender();};
const invite=new URL(location.href).searchParams.get('room');if(invite){mode.value='online';$('roomCode').value=invite.toUpperCase();mode.onchange();let saved=savedRoom();if(saved?.code===invite.toUpperCase())resume();}else{mode.value='online';mode.onchange();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRoom()});
