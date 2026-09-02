
const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const crypto=require("crypto");

const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
app.use(express.static("public"));
app.get("/", (req,res)=res.sendFile(__dirname + "/index.html"));
app.get("/health",(req,res)=>res.status(200).send("ok"));
const rooms=new Map();
const GRACE_MS=90000;

const clampTarget=n=>[6,10,12].includes(Number(n))?Number(n):6;
const randCode=()=>crypto.randomBytes(3).toString("hex").toUpperCase();
const randToken=()=>crypto.randomBytes(24).toString("hex");
const makeDeck=()=>{let d=[],id=1;for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)d.push({a,b,faceA:a,faceB:b,id:id++});return d};
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const teamOf=s=>s%2;
const pips=h=>h.reduce((n,t)=>n+t.a+t.b,0);
const vals=t=>[t.faceA??t.a,t.faceB??t.b];
const ends=b=>!b.length?[null,null]:b.length===1?vals(b[0]):[b[0].a,b[b.length-1].b];
const canPlay=(b,t)=>!b.length||(()=>{const[L,R]=ends(b);return t.a===L||t.b===L||t.a===R||t.b===R})();
const orientLeft=(t,L)=>t.b===L?{...t}:{a:t.b,b:t.a,faceA:t.faceB??t.b,faceB:t.faceA??t.a,id:t.id};
const orientRight=(t,R)=>t.a===R?{...t}:{a:t.b,b:t.a,faceA:t.faceB??t.b,faceB:t.faceA??t.a,id:t.id};
const turnSeconds=c=>c===2?15:c===3?12:10;
const connectedPlayers=r=>r.players.filter(p=>p&&p.connected).length;
const addHistory=(r,s)=>{r.history.push(s);if(r.history.length>60)r.history.shift()};

function clearTimer(r){if(r.timer){clearTimeout(r.timer);r.timer=null}}
function publicPlayers(r){return r.players.map(p=>p?{name:p.name,seat:p.seat,connected:!!p.connected,ready:!!p.ready}:null)}
function roomState(r){return {
 code:r.code,players:publicPlayers(r),hostSeat:r.hostSeat,mode:r.mode,target:r.target,phase:r.phase,
 message:r.message||"",spectatorCount:r.spectators.size,rematchVotes:[...r.rematchVotes]
}}
function gameBase(r){return {
 code:r.code,players:publicPlayers(r),hostSeat:r.hostSeat,mode:r.mode,target:r.target,phase:r.phase,
 turn:r.turn,handNo:r.handNo,handValue:r.handValue,board:r.board,handCounts:r.hands.map(h=>h.length),
 revealHands:r.revealHands,scores:r.scores,teamScores:r.teamScores,deadline:r.deadline||0,message:r.message||"",
 poseOptions:r.poseOptions||[],history:r.history,lastEvent:r.lastEvent||"",spectatorCount:r.spectators.size,
 bruckStartTeam:r.bruckStartTeam,bruckStartCount:r.bruckStartCount,oneOnePlayTwo:r.oneOnePlayTwo,nextPlayFor:r.nextPlayFor
}}
function privateState(r,seat){return {...gameBase(r),hand:r.hands[seat]||[],revealedHands:r.revealHands?r.hands:null}}
function spectatorState(r){return {...gameBase(r),hand:[],revealedHands:r.revealHands?r.hands:null}}
function emitAll(r){
 io.to(r.code).emit("room-state",roomState(r));
 r.players.forEach(p=>{if(p&&p.connected&&p.id)io.to(p.id).emit("private-state",privateState(r,p.seat))});
 for(const id of r.spectators.keys())io.to(id).emit("spectator-state",spectatorState(r));
}
function actionAllowed(socket){
 const now=Date.now(),a=socket.data.actions||(socket.data.actions=[]);
 while(a.length&&a[0]<now-2000)a.shift();
 if(a.length>30)return false;a.push(now);return true;
}
function setEvent(r,type,msg){r.lastEvent=type;r.message=msg||""}

function applyBruckAndStartWin(r,winnerSeat){
 const team=teamOf(winnerSeat);
 const other=1-team;

 // ONE-ONE PLAY TWO:
 // The next hand decides which team "goes two".
 if(r.oneOnePlayTwo){
   r.oneOnePlayTwo=false;
   r.bruckStartTeam=team;
   r.bruckStartCount=2;
   r.teamScores=[0,0];
   r.teamScores[team]=2;
   r.nextPlayFor=1;
   return {team,count:2,won:false,bruck:false,oneOneResolved:true};
 }

 // No team currently "gone" any score: winner goes one.
 if(r.bruckStartTeam===null || r.bruckStartCount===0){
   r.bruckStartTeam=team;
   r.bruckStartCount=1;
   r.teamScores=[0,0];
   r.teamScores[team]=1;
   r.nextPlayFor=1;
   return {team,count:1,won:false,bruck:false,oneOne:false};
 }

 // Same team wins again: 1 -> 2 -> 3 ... -> 6.
 if(r.bruckStartTeam===team){
   r.bruckStartCount+=1;
   r.teamScores=[0,0];
   r.teamScores[team]=r.bruckStartCount;
   r.nextPlayFor=1;
   return {team,count:r.bruckStartCount,won:r.bruckStartCount>=6,bruck:false,oneOne:false};
 }

 // Opponent answers when the leading team is only on 1:
 // that creates ONE-ONE, and the NEXT hand plays for 2.
 if(r.bruckStartCount===1){
   r.oneOnePlayTwo=true;
   r.bruckStartTeam=null;
   r.bruckStartCount=0;
   r.teamScores=[1,1];
   r.nextPlayFor=2;
   return {team,count:1,won:false,bruck:false,oneOne:true};
 }

 // Opponent answers a team that is on 2 or more:
 // BRUCK. The running score is erased. The NEXT hand starts again playing for 1.
 r.oneOnePlayTwo=false;
 r.bruckStartTeam=null;
 r.bruckStartCount=0;
 r.teamScores=[0,0];
 r.nextPlayFor=1;
 return {team,count:0,won:false,bruck:true,oneOne:false};
}
function scheduleTurn(r){
 clearTimer(r);if(r.phase!=="playing"||r.turn==null)return;
 if(connectedPlayers(r)<4){pauseForDisconnect(r);return}
 const sec=turnSeconds(r.hands[r.turn].length);r.deadline=Date.now()+sec*1000;
 r.timer=setTimeout(()=>autoAction(r),sec*1000+75);emitAll(r)
}
function allBlocked(r){return r.hands.every(h=>!h.some(t=>canPlay(r.board,t)))}
function nextPlayableTurn(r){
 let guard=0;
 while(guard++<4&&r.phase==="playing"){
   if(r.hands[r.turn].some(t=>canPlay(r.board,t)))break;
   if(allBlocked(r)){finishBlocked(r);return}
   const n=r.players[r.turn]?.name||"Player";addHistory(r,`${n} passed.`);setEvent(r,"pass",`${n} passes.`);
   r.turn=(r.turn+1)%4
 }
 if(r.phase==="playing")scheduleTurn(r)
}
function playTile(r,seat,tileId,side,automatic=false){
 if(r.phase!=="playing"||r.turn!==seat)return {ok:false,error:"Not your turn."};
 const hand=r.hands[seat],idx=hand.findIndex(t=>t.id===Number(tileId));
 if(idx<0)return {ok:false,error:"Domino not found in your hand."};
 const t=hand[idx];
 if(!r.board.length)side="start";
 else{
   const[L,R]=ends(r.board),left=t.a===L||t.b===L,right=t.a===R||t.b===R;
   if(side==="left"&&!left)return {ok:false,error:"That domino does not match the left end."};
   if(side==="right"&&!right)return {ok:false,error:"That domino does not match the right end."};
   if(side!=="left"&&side!=="right"){
     if(left&&!right)side="left";else if(right&&!left)side="right";else if(left&&right)side="left";
     else return {ok:false,error:"That domino cannot be played."}
   }
 }
 clearTimer(r);hand.splice(idx,1);r.playSequence++;
 if(!r.board.length)r.board=[{...t,playedOrder:r.playSequence,player:seat,side:"start"}];
 else if(side==="left"){const[L]=ends(r.board);r.board.unshift({...orientLeft(t,L),playedOrder:r.playSequence,player:seat,side:"left"})}
 else{const[,R]=ends(r.board);r.board.push({...orientRight(t,R),playedOrder:r.playSequence,player:seat,side:"right"})}
 const n=r.players[seat]?.name||"Player";
 addHistory(r,`${n} played ${t.a}-${t.b}${automatic?" automatically":""}.`);
 setEvent(r,"play",`${n} played ${t.a}-${t.b}.`);
 if(!hand.length){finishWin(r,seat);return {ok:true}}
 r.turn=(r.turn+1)%4;nextPlayableTurn(r);return {ok:true}
}
function autoAction(r){
 if(r.phase!=="playing")return;
 const seat=r.turn,playables=r.hands[seat].filter(t=>canPlay(r.board,t));
 if(!playables.length){
   if(allBlocked(r)){finishBlocked(r);return}
   const n=r.players[seat]?.name||"Player";addHistory(r,`${n} passed.`);setEvent(r,"pass",`${n} passes.`);
   r.turn=(r.turn+1)%4;nextPlayableTurn(r);return
 }
 const t=playables[Math.floor(Math.random()*playables.length)];let side="start";
 if(r.board.length){const[L,R]=ends(r.board),l=t.a===L||t.b===L,rr=t.a===R||t.b===R;side=l&&rr?(Math.random()<.5?"left":"right"):(l?"left":"right")}
 playTile(r,seat,t.id,side,true)
}
function finishWin(r,seat){
 clearTimer(r);r.revealHands=true;r.deadline=0;const n=r.players[seat]?.name||"Player";
 let match=-1;
 if(r.mode==="partner"){
   const bs=applyBruckAndStartWin(r,seat);
   r.lastWinnerTeam=teamOf(seat);
   if(bs.oneOne){
     addHistory(r,`${n} makes it ONE-ONE. The next hand plays for 2.`);
   }else if(bs.oneOneResolved){
     addHistory(r,`${n} wins ONE-ONE PLAY TWO. Team ${bs.team===0?"A":"B"} goes 2.`);
   }else if(bs.bruck){
     addHistory(r,`${n} BRUCKS the game. The score resets and the next hand starts again playing for 1.`);
   }else{
     addHistory(r,`${n} wins hand ${r.handNo}. Team ${bs.team===0?"A":"B"} goes ${bs.count}.`);
   }
   match=bs.won?bs.team:-1;
 }else{
   r.scores[seat]+=r.handValue;r.lastIndividualWinner=seat;
   addHistory(r,`${n} won hand ${r.handNo} for ${r.handValue} point${r.handValue===1?"":"s"}.`);
   match=r.scores.findIndex(v=>v>=r.target);
 }
 if(match>=0){
   r.phase="match-over";r.turn=null;r.rematchVotes.clear();
   r.message=r.mode==="partner"?`Team ${match===0?"A":"B"} wins the Bruck and Start game by going 6.`:`${r.players[match]?.name||"Player"} wins the match.`;
   addHistory(r,r.message);r.lastEvent="match-win";emitAll(r);return
 }
 r.phase="hand-over";r.turn=null;r.message=`${n} wins the hand.`;r.lastEvent="hand-win";emitAll(r)
}
function finishBlocked(r){
 clearTimer(r);r.revealHands=true;r.deadline=0;
 const counts=r.hands.map(pips),low=Math.min(...counts),lows=counts.map((v,i)=>v===low?i:-1).filter(i=>i>=0);
 let tied=false,winner=null;
 if(r.mode==="partner"){const teams=[...new Set(lows.map(teamOf))];tied=teams.length>1;if(!tied)winner=lows[0]}
 else{tied=lows.length>1;if(!tied)winner=lows[0]}
 if(tied){
   r.tiedCarry=true;r.phase="hand-over";r.turn=null;r.message=`Blocked tie. Next hand is worth 2 points. Counts: ${counts.join(", ")}.`;
   addHistory(r,r.message);r.lastEvent="blocked-win";emitAll(r);return
 }
 const n=r.players[winner]?.name||"Player";
 if(r.mode==="partner"){
   const bs=applyBruckAndStartWin(r,winner);
   r.lastWinnerTeam=teamOf(winner);
   if(bs.oneOne){
     addHistory(r,`${n} wins the blocked hand with ${low}, making it ONE-ONE. The next hand plays for 2. Counts: ${counts.join(", ")}.`);
   }else if(bs.oneOneResolved){
     addHistory(r,`${n} wins ONE-ONE PLAY TWO on a blocked hand. Team ${bs.team===0?"A":"B"} goes 2. Counts: ${counts.join(", ")}.`);
   }else if(bs.bruck){
     addHistory(r,`${n} BRUCKS the game on a blocked hand. The score resets and the next hand plays for 1. Counts: ${counts.join(", ")}.`);
   }else{
     addHistory(r,`${n} wins the blocked hand with ${low}. Team ${bs.team===0?"A":"B"} goes ${bs.count}. Counts: ${counts.join(", ")}.`);
   }
   if(bs.won){
     r.phase="match-over";r.turn=null;r.rematchVotes.clear();
     r.message=`Team ${bs.team===0?"A":"B"} wins the Bruck and Start game by going 6.`;
     r.lastEvent="match-win";emitAll(r);return
   }
 }else{
   r.scores[winner]+=r.handValue;r.lastIndividualWinner=winner;
   addHistory(r,`${n} wins the blocked hand with ${low}. Counts: ${counts.join(", ")}.`);
 }
 r.phase="hand-over";r.turn=null;
 r.message=`${n} wins the blocked hand with ${low}. Counts: ${counts.join(", ")}.`;
 r.lastEvent="blocked-win";emitAll(r)
}
function beginHand(r,poser=null){
 clearTimer(r);const d=shuffle(makeDeck());r.hands=[d.slice(0,7),d.slice(7,14),d.slice(14,21),d.slice(21,28)];
 r.board=[];r.playSequence=0;r.revealHands=false;r.handNo++;r.handValue=r.tiedCarry?2:(r.mode==="partner"?(r.nextPlayFor||1):1);r.phase="playing";r.poseOptions=[];r.message="";
 if(r.tiedCarry){r.turn=r.hands.findIndex(h=>h.some(t=>t.a===6&&t.b===6));r.tiedCarry=false}
 else if(Number.isInteger(poser))r.turn=poser;
 else if(r.mode==="individual"&&Number.isInteger(r.lastIndividualWinner))r.turn=r.lastIndividualWinner;
 else r.turn=0;
 addHistory(r,`Hand ${r.handNo} started.`);r.lastEvent="";scheduleTurn(r)
}
function nextHand(r){
 if(r.phase!=="hand-over")return;
 if(r.tiedCarry){beginHand(r);return}
 if(r.mode==="partner"&&r.lastWinnerTeam!==null){
   r.phase="choose-poser";r.poseOptions=r.lastWinnerTeam===0?[0,2]:[1,3];r.turn=null;r.message="Winning partners: choose who poses next.";emitAll(r);return
 }
 beginHand(r)
}
function startIfReady(r){
 if(r.phase!=="waiting")return;
 if(r.players.every(p=>p&&p.connected&&p.ready)){r.players.forEach(p=>p.ready=false);beginHand(r,0)}
 else emitAll(r)
}
function pauseForDisconnect(r){
 if(["playing","hand-over","choose-poser"].includes(r.phase)){
   clearTimer(r);r.phaseBeforePause=r.phase;r.turnBeforePause=r.turn;r.phase="paused";r.deadline=0;
   r.message="A player disconnected. Game paused while they reconnect.";addHistory(r,r.message);emitAll(r)
 }
}
function resumeIfPossible(r){
 if(r.phase!=="paused"||connectedPlayers(r)<4)return;
 const prev=r.phaseBeforePause||"playing";r.phase=prev;r.turn=r.turnBeforePause;r.phaseBeforePause=null;r.turnBeforePause=null;
 r.message="All players reconnected.";addHistory(r,r.message);
 if(r.phase==="playing")scheduleTurn(r);else emitAll(r)
}
function promoteHost(r){
 if(r.players[r.hostSeat])return;
 const idx=r.players.findIndex(Boolean);r.hostSeat=idx>=0?idx:0
}
function abandonSeat(r,seat){
 const p=r.players[seat];if(!p)return;
 if(p.graceTimer)clearTimeout(p.graceTimer);
 r.players[seat]=null;r.ready=false;promoteHost(r);clearTimer(r);
 r.hands=[[],[],[],[]];r.board=[];r.turn=null;r.phase="waiting";r.revealHands=false;r.message="A seat opened. Waiting for four ready players.";
 r.players.forEach(x=>{if(x)x.ready=false});emitAll(r)
}
function newRoom(name,mode,target,socket){
 let code;do code=randCode();while(rooms.has(code));
 const token=randToken(),room={code,mode:mode==="individual"?"individual":"partner",target:clampTarget(target),hostSeat:0,
 players:[null,null,null,null],spectators:new Map(),hands:[[],[],[],[]],board:[],turn:null,handNo:0,handValue:1,
 tiedCarry:false,lastWinnerTeam:null,lastIndividualWinner:null,scores:[0,0,0,0],teamScores:[0,0],phase:"waiting",
 revealHands:false,playSequence:0,timer:null,deadline:0,message:"Waiting for four players to get ready.",poseOptions:[],
 history:[],lastEvent:"",rematchVotes:new Set(),phaseBeforePause:null,turnBeforePause:null,
 bruckStartTeam:null,bruckStartCount:0,oneOnePlayTwo:false,nextPlayFor:1};
 room.players[0]={id:socket.id,name,seat:0,token,connected:true,ready:false,graceTimer:null};rooms.set(code,room);return {room,token}
}

io.on("connection",socket=>{
 socket.onAny(()=>{if(!actionAllowed(socket))socket.emit("action-error","Too many actions. Please slow down.")});

 socket.on("create-room",({name,mode,target})=>{
   name=String(name||"").trim().slice(0,20);if(!name)return socket.emit("room-error","A name is required.");
   const {room,token}=newRoom(name,mode,target,socket); if(room.mode==="partner") room.target=6;socket.data.roomCode=room.code;socket.data.seat=0;socket.join(room.code);
   socket.emit("seat-assigned",{code:room.code,seat:0,token});emitAll(room)
 });
 socket.on("join-room",({name,code})=>{
   name=String(name||"").trim().slice(0,20);code=String(code||"").trim().toUpperCase();const r=rooms.get(code);
   if(!r)return socket.emit("room-error","Room not found.");if(!name)return socket.emit("room-error","A name is required.");
   if(r.phase!=="waiting"&&r.phase!=="paused")return socket.emit("room-error","That game has already started.");
   const seat=r.players.findIndex(p=>!p);if(seat<0)return socket.emit("room-error","That room is full.");
   const token=randToken();r.players[seat]={id:socket.id,name,seat,token,connected:true,ready:false,graceTimer:null};
   socket.data.roomCode=code;socket.data.seat=seat;socket.join(code);socket.emit("seat-assigned",{code,seat,token});emitAll(r)
 });
 socket.on("join-spectator",({name,code})=>{
   code=String(code||"").trim().toUpperCase();const r=rooms.get(code);if(!r)return socket.emit("room-error","Room not found.");
   const n=String(name||"Spectator").trim().slice(0,20)||"Spectator";r.spectators.set(socket.id,{name:n});
   socket.data.roomCode=code;socket.data.spectator=true;socket.join(code);socket.emit("spectator-assigned",{code});emitAll(r)
 });
 socket.on("reconnect-player",({roomCode,token})=>{
   const code=String(roomCode||"").trim().toUpperCase(),r=rooms.get(code);if(!r)return socket.emit("room-error","Room no longer exists.");
   const seat=r.players.findIndex(p=>p&&p.token===token);if(seat<0)return socket.emit("room-error","Reconnect seat not found.");
   const p=r.players[seat];if(p.graceTimer){clearTimeout(p.graceTimer);p.graceTimer=null}p.id=socket.id;p.connected=true;
   socket.data.roomCode=code;socket.data.seat=seat;socket.join(code);socket.emit("reconnect-ok",{code,seat,token});resumeIfPossible(r);emitAll(r)
 });
 socket.on("set-room-options",({mode,target})=>{
   const r=rooms.get(socket.data.roomCode),seat=socket.data.seat;if(!r||seat!==r.hostSeat||r.phase!=="waiting")return;
   r.mode=mode==="individual"?"individual":"partner";r.target=r.mode==="partner"?6:clampTarget(target);emitAll(r)
 });
 socket.on("toggle-ready",()=>{
   const r=rooms.get(socket.data.roomCode),seat=socket.data.seat;if(!r||!Number.isInteger(seat)||r.phase!=="waiting")return;
   const p=r.players[seat];if(!p||!p.connected)return;p.ready=!p.ready;setEvent(r,"ready",`${p.name} is ${p.ready?"ready":"not ready"}.`);startIfReady(r)
 });
 socket.on("play-domino",({tileId,side})=>{
   const r=rooms.get(socket.data.roomCode),seat=socket.data.seat;if(!r||!Number.isInteger(seat))return;
   const res=playTile(r,seat,tileId,side,false);if(!res.ok)socket.emit("action-error",res.error)
 });
 socket.on("next-hand",()=>{const r=rooms.get(socket.data.roomCode);if(r&&Number.isInteger(socket.data.seat))nextHand(r)});
 socket.on("choose-poser",({seat:chosen})=>{
   const r=rooms.get(socket.data.roomCode),caller=socket.data.seat;if(!r||r.phase!=="choose-poser")return;
   if(!r.poseOptions.includes(caller)||!r.poseOptions.includes(Number(chosen)))return socket.emit("action-error","That poser choice is not allowed.");
   beginHand(r,Number(chosen))
 });
 socket.on("rematch-vote",()=>{
   const r=rooms.get(socket.data.roomCode),seat=socket.data.seat;if(!r||r.phase!=="match-over"||!Number.isInteger(seat))return;
   r.rematchVotes.add(seat);r.message=`Rematch votes: ${r.rematchVotes.size}/4`;emitAll(r);
   if(r.rematchVotes.size===4){
     r.scores=[0,0,0,0];r.teamScores=[0,0];r.bruckStartTeam=null;r.bruckStartCount=0;r.oneOnePlayTwo=false;r.nextPlayFor=1;r.handNo=0;r.tiedCarry=false;r.lastWinnerTeam=null;r.lastIndividualWinner=null;r.rematchVotes.clear();
     r.history=[];r.players.forEach(p=>{if(p)p.ready=false});r.phase="waiting";r.message="Rematch ready. Press READY.";emitAll(r)
   }
 });
 socket.on("leave-room",()=>{
   const r=rooms.get(socket.data.roomCode);if(!r)return;
   if(socket.data.spectator){r.spectators.delete(socket.id);socket.leave(r.code);emitAll(r);return}
   const seat=socket.data.seat;if(Number.isInteger(seat))abandonSeat(r,seat);socket.leave(r.code)
 });
 socket.on("disconnect",()=>{
   const r=rooms.get(socket.data.roomCode);if(!r)return;
   if(socket.data.spectator){r.spectators.delete(socket.id);emitAll(r);return}
   const seat=socket.data.seat,p=r.players[seat];if(!p||p.id!==socket.id)return;
   p.connected=false;p.id=null;p.ready=false;pauseForDisconnect(r);
   p.graceTimer=setTimeout(()=>abandonSeat(r,seat),GRACE_MS);emitAll(r)
 });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0",()=>console.log(`Jamaican Vibes Domino server ready on port ${PORT}.`));
