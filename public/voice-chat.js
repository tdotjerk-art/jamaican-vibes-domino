/* Four-player, opt-in WebRTC audio. Signaling stays inside the seated room. */
(function(root){
 let socket=null,room=null,seat=null,stream=null,joining=false,muted=false,epoch=0,self=null,config=null;
 let participants=[],notice='',playbackBlocked=false;
 const peers=new Map(),panels=[];
 function status(){
  const connected=Array.from(peers.values()).filter(p=>p.pc.connectionState==='connected').length;
  if(joining)return 'Opening microphone…';
  if(!stream)return notice||'Talk with the players at your table.';
  if(notice)return notice;
  if(connected<participants.length-1)return `Connecting voice · ${participants.length}/4 joined`;
  return `${muted?'Microphone muted':'Microphone on'} · ${connected+1}/${participants.length} connected`;
 }
 function paint(){
  for(const panel of panels){
   panel.hidden=!(room && seat!==null && root.gameConnectionMode==='online');
   panel.querySelector('[data-voice-status]').textContent=status();
   const join=panel.querySelector('[data-voice-join]');join.hidden=!!stream;join.disabled=joining;
   const mute=panel.querySelector('[data-voice-mute]');mute.hidden=!stream;mute.textContent=muted?'Unmute mic':'Mute mic';mute.setAttribute('aria-pressed',String(muted));
   panel.querySelector('[data-voice-leave]').hidden=!stream&&!joining;
   panel.querySelector('[data-voice-listen]').hidden=!playbackBlocked;
   panel.querySelector('[data-voice-players]').textContent=stream?participants.map(p=>`${p.name}${p.muted?' (muted)':''}`).join(' · '):'';
  }
 }
 function closePeer(id){
  const peer=peers.get(id);if(!peer)return;peers.delete(id);
  clearTimeout(peer.failureTimer);peer.pc.onconnectionstatechange=null;peer.pc.ontrack=null;peer.pc.onicecandidate=null;peer.pc.onnegotiationneeded=null;peer.pc.close();peer.audio.srcObject=null;peer.audio.remove();
 }
 function leave(message='',send=true){
  epoch++;joining=false;
  if(send&&socket?.connected)socket.emit('voice-leave');
  for(const id of Array.from(peers.keys()))closePeer(id);
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=null;muted=false;participants=[];self=null;notice=message;playbackBlocked=false;paint();
 }
 async function playAudio(audio){
  try{await audio.play();}catch(e){playbackBlocked=true;paint();}
 }
 async function resumeAudio(){
  playbackBlocked=false;
  await Promise.all(Array.from(peers.values(),p=>playAudio(p.audio)));paint();
 }
 function signal(id,data){if(stream&&socket?.connected&&peers.has(id))socket.emit('voice-signal',{to:id,...data});}
 function peerFor(id){
  if(peers.has(id))return peers.get(id);
  const pc=new RTCPeerConnection({iceServers:config.iceServers});
  const audio=document.createElement('audio');audio.autoplay=true;audio.setAttribute('playsinline','');audio.hidden=true;document.body.appendChild(audio);
  const peer={pc,audio,queue:Promise.resolve(),candidates:[],makingOffer:false,ignoreOffer:false,polite:self>id};peers.set(id,peer);
  for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
  pc.ontrack=e=>{audio.srcObject=e.streams[0]||new MediaStream([e.track]);playAudio(audio);};
  pc.onicecandidate=e=>{if(e.candidate)signal(id,{candidate:e.candidate.toJSON()});};
  pc.onconnectionstatechange=()=>{
   if(pc.connectionState==='connected')clearTimeout(peer.failureTimer);
   if(pc.connectionState==='failed')notice='Voice could not connect to a player. Leave Voice and rejoin.';
   else if(pc.connectionState==='connected')notice='';
   paint();
  };
  peer.failureTimer=setTimeout(()=>{
   if(peers.get(id)===peer&&pc.connectionState!=='connected'){notice='Voice could not reach a player. Leave Voice and rejoin, or try another network.';paint();}
  },20000);
  pc.onnegotiationneeded=async()=>{
   try{peer.makingOffer=true;await pc.setLocalDescription();signal(id,{description:pc.localDescription});}
   catch(e){if(peers.get(id)===peer){notice='Voice connection interrupted. Leave Voice and rejoin.';paint();}}
   finally{peer.makingOffer=false;}
  };
  return peer;
 }
 function roster(data){
  if(!stream||!self||!Array.isArray(data?.peers))return;
  participants=data.peers;
  if(!participants.some(p=>p.id===self)){leave('Voice session ended.',false);return;}
  const wanted=new Set(participants.filter(p=>p.id!==self).map(p=>p.id));
  for(const id of Array.from(peers.keys()))if(!wanted.has(id))closePeer(id);
  for(const id of wanted)peerFor(id);
  paint();
 }
 async function receive(data){
  if(!stream||!self||!participants.some(p=>p.id===data?.from))return;
  const peer=peerFor(data.from),pc=peer.pc,version=epoch;
  peer.queue=peer.queue.then(async()=>{
   if(version!==epoch||peers.get(data.from)!==peer)return;
   if(data.description){
    const collision=data.description.type==='offer'&&(peer.makingOffer||pc.signalingState!=='stable');
    peer.ignoreOffer=!peer.polite&&collision;if(peer.ignoreOffer)return;
    await pc.setRemoteDescription(data.description);
    for(const c of peer.candidates.splice(0))await pc.addIceCandidate(c);
    if(data.description.type==='offer'){await pc.setLocalDescription();signal(data.from,{description:pc.localDescription});}
   }else if(data.candidate){
    if(peer.ignoreOffer)return;
    if(pc.remoteDescription)await pc.addIceCandidate(data.candidate);else peer.candidates.push(data.candidate);
   }
  }).catch(()=>{if(version===epoch){notice='Voice connection interrupted. Leave Voice and rejoin.';paint();}});
 }
 async function join(){
  if(joining||stream||!socket?.connected||!room||seat===null)return;
  if(!navigator.mediaDevices?.getUserMedia||!root.RTCPeerConnection){notice='Voice needs a browser with microphone support over HTTPS.';paint();return;}
  const version=++epoch;joining=true;notice='';paint();
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(version!==epoch){media.getTracks().forEach(t=>t.stop());return;}
   stream=media;
   const reply=await new Promise((resolve,reject)=>{
    socket.timeout(8000).emit('voice-join',{},(err,data)=>err?reject(new Error('timeout')):resolve(data));
   });
   if(version!==epoch)return;
   if(reply.error)throw new Error(reply.error);
   self=reply.self;config=reply;joining=false;
   stream.getAudioTracks().forEach(t=>{t.onended=()=>leave('Microphone stopped. Tap Join Voice to reconnect.');});
   roster(reply);resumeAudio();
  }catch(e){
   if(version!==epoch)return;
   const message=e.name==='NotAllowedError'?'Microphone permission denied. Allow microphone access, then tap Join Voice.':e.name==='NotFoundError'?'No microphone found.':e.message==='timeout'?'Voice server did not respond. Try Join Voice again.':'Could not join voice. Check microphone access and try again.';
   leave(message);
  }
 }
 function attach(next){
  if(socket===next)return;leave('',!!socket);socket=next;room=null;seat=null;
  const assigned=data=>{leave('',false);room=data.code;seat=data.seat;paint();};
  next.on('seat-assigned',assigned);next.on('reconnect-ok',assigned);
  next.on('spectator-assigned',()=>{leave();room=null;seat=null;paint();});
  next.on('disconnect',()=>{leave('Voice disconnected. Rejoin after the game reconnects.',false);room=null;seat=null;paint();});
  next.on('voice-roster',roster);next.on('voice-signal',receive);
  next.on('voice-ended',()=>leave('Voice session ended.',false));
  next.on('room-state',state=>{if(room && state.code!==room){leave();room=null;seat=null;}paint();});
 }
 function panel(id,parent){
  if(!parent)return;const el=document.createElement('section');el.id=id;el.className='jv-voice';el.hidden=true;el.setAttribute('aria-label','Table voice chat');
  el.innerHTML='<strong>🎙 Table Voice</strong><span data-voice-status role="status"></span><div class="jv-voice-buttons"><button type="button" data-voice-join>Join Voice</button><button type="button" data-voice-mute hidden>Mute mic</button><button type="button" data-voice-leave hidden>Leave Voice</button><button type="button" data-voice-listen hidden>Tap to hear players</button></div><small data-voice-players></small>';
  parent.appendChild(el);
  if(id==='jvVoiceLobby')document.getElementById('jvCopyCode')?.after(el);
  panels.push(el);
  el.querySelector('[data-voice-join]').onclick=join;
  el.querySelector('[data-voice-leave]').onclick=()=>leave();
  el.querySelector('[data-voice-listen]').onclick=resumeAudio;
  el.querySelector('[data-voice-mute]').onclick=()=>{if(!stream)return;muted=!muted;stream.getAudioTracks().forEach(t=>t.enabled=!muted);socket.emit('voice-mute',{muted});paint();};
 }
 function mount(){
  panel('jvVoiceLobby',document.querySelector('#jvLobby .jv-card'));
  panel('jvVoiceGame',document.querySelector('.app'));
  for(const id of ['jvQuitGameBtn','jvLeave','jvLeaveTop','jvLeaveAfter','jvSingle'])document.getElementById(id)?.addEventListener('click',()=>{leave();room=null;seat=null;paint();});
  addEventListener('pagehide',()=>leave());
  if(root.onlineSocket)attach(root.onlineSocket);
 }
 root.JVVoice={attach,leave};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);
