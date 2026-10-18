const crypto=require('node:crypto');

function iceConfig(){
 const iceServers=[{urls:'stun:stun.l.google.com:19302'}];
 const urls=(process.env.VOICE_TURN_URLS||'').split(',').map(s=>s.trim()).filter(s=>/^turns?:/.test(s));
 if(urls.length){
  let username=process.env.VOICE_TURN_USERNAME,credential=process.env.VOICE_TURN_CREDENTIAL;
  if(process.env.VOICE_TURN_SECRET){
   username=`${Math.floor(Date.now()/1000)+3600}:domino`;
   credential=crypto.createHmac('sha1',process.env.VOICE_TURN_SECRET).update(username).digest('base64');
  }
  if(username&&credential)iceServers.push({urls,username,credential});
 }
 return {iceServers,relayConfigured:iceServers.length>1};
}
function installVoice(io,rooms){
 const channels=new Map();
 const seated=socket=>{
  const r=rooms.get(socket.data.roomCode),p=r?.players[socket.data.seat];
  return !socket.data.spectator && p?.connected && p.id===socket.id ? {r,p}:null;
 };
 const roster=code=>{
  const group=channels.get(code);if(!group)return;
  const r=rooms.get(code);
  for(const p of group.values()){
   if(!r || r.players[p.seat]?.id!==p.id || !r.players[p.seat]?.connected){
    group.delete(p.id);io.to(p.id).emit('voice-ended');
   }
  }
  const peers=Array.from(group.values());
  for(const p of peers)io.to(p.id).emit('voice-roster',{peers});
 };
 io.on('connection',socket=>{
  let voiceRoom=null,events=[];
  const leave=()=>{
   if(!voiceRoom)return;const code=voiceRoom;voiceRoom=null;
   const group=channels.get(code);group?.delete(socket.id);
   if(!group?.size)channels.delete(code);else roster(code);
  };
  socket.on('voice-join',(_,ack)=>{
   const member=seated(socket);
   if(!member){if(typeof ack==='function')ack({error:'Join the room as a player before joining voice.'});return;}
   leave();voiceRoom=member.r.code;
   if(!channels.has(voiceRoom))channels.set(voiceRoom,new Map());
   const group=channels.get(voiceRoom);
   group.set(socket.id,{id:socket.id,name:member.p.name,seat:socket.data.seat,muted:false});
   if(typeof ack==='function')ack({self:socket.id,...iceConfig(),peers:Array.from(group.values())});
   roster(voiceRoom);
  });
  socket.on('voice-mute',data=>{
   const group=channels.get(voiceRoom),p=group?.get(socket.id);if(!p||!seated(socket))return;
   p.muted=!!data?.muted;roster(voiceRoom);
  });
  socket.on('voice-signal',data=>{
   const member=seated(socket),group=channels.get(voiceRoom);
   if(!member || member.r.code!==voiceRoom || !group?.has(socket.id) || !group.has(data?.to) || data.to===socket.id)return;
   const now=Date.now();events=events.filter(t=>now-t<5000);if(events.length>=100)return;events.push(now);
   const message={from:socket.id};
   if(data.description){
    const {type,sdp}=data.description;
    if(!['offer','answer'].includes(type)||typeof sdp!=='string'||sdp.length>24000)return;
    message.description={type,sdp};
   }else if(data.candidate){
    const c=data.candidate;
    if(typeof c.candidate!=='string'||c.candidate.length>2000)return;
    message.candidate={candidate:c.candidate,sdpMid:typeof c.sdpMid==='string'?c.sdpMid.slice(0,256):null,sdpMLineIndex:Number.isInteger(c.sdpMLineIndex)?c.sdpMLineIndex:null};
   }else return;
   io.to(data.to).emit('voice-signal',message);
  });
  socket.on('voice-leave',leave);
  // These listeners run before the game replaces socket.data or removes the seat.
  for(const event of ['leave-room','disconnect','create-room','join-room','join-spectator','reconnect-player'])socket.on(event,leave);
  socket.on('reconnect-player',()=>setImmediate(()=>roster(socket.data.roomCode)));
 });
}
module.exports={installVoice,iceConfig};
