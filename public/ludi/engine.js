(function(root){
 'use strict';
 const TEAMS=[{name:'Green',color:'#10964b',start:1},{name:'Red',color:'#e84444',start:13},{name:'Black',color:'#202924',start:25},{name:'Gold',color:'#fed100',start:37}];
 const TRACK=[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[3,5],[2,5],[1,5],[0,5],[0,6],[0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[5,8],[5,9],[5,10],[5,11],[5,12],[6,12],[7,12],[7,11],[7,10],[7,9],[7,8],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[8,5],[7,5],[7,4],[7,3],[7,2],[7,1],[7,0],[6,0]];
 const HOME=52,OUTER_LAST=46;
 const cleanName=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim().slice(0,24):'';
 function fresh(names){
  if(!Array.isArray(names)||names.length<2||names.length>4||names.some(n=>!cleanName(n)))throw Error('Enter names for 2, 3, or 4 players.');
  const colors=names.length===2?[0,2]:names.map((_,i)=>i);
  return {players:names.map((name,i)=>({name:cleanName(name),color:colors[i],tokens:[-1,-1,-1,-1]})),turn:0,phase:'roll',dice:[null,null],remaining:[],capturedThisRoll:[],rollNo:0,bonus:false,winner:null,last:null,history:['Roll a six to bring a piece out.']};
 }
 function ring(player,progress){return progress>=0&&progress<=OUTER_LAST?(TEAMS[player.color].start+progress)%TRACK.length:null;}
 function coordinate(player,progress){
  if(progress<0)return null;if(progress===HOME)return [6,6];
  if(progress<=OUTER_LAST)return TRACK[ring(player,progress)];
  const n=progress-OUTER_LAST;return player.color===0?[6,n]:player.color===1?[n,6]:player.color===2?[6,12-n]:[12-n,6];
 }
 function occupants(g,index){return g.players.flatMap((p,seat)=>p.tokens.flatMap((progress,piece)=>ring(p,progress)===index?[{seat,piece}]:[]));}
 function movesFor(g,die){
  const player=g.players[g.turn];
  return player.tokens.flatMap((from,piece)=>{
   // A piece that captured with the first die cannot move again on this roll.
   if(g.capturedThisRoll.includes(piece))return [];
   if(from===HOME||from<0&&die!==6)return [];
   const to=from<0?0:from+die;if(to>HOME)return [];
   for(let step=from<0?0:from+1;step<=Math.min(to,OUTER_LAST);step++){
    const index=ring(player,step),on=occupants(g,index);
    if(g.players.some((_,seat)=>seat!==g.turn&&on.filter(t=>t.seat===seat).length>=2))return [];
   }
   return [{piece,from,to}];
  });
 }
 function rawLegal(g,dieIndex){
  if(g.phase!=='move')return [];
  return g.remaining.filter(index=>dieIndex===undefined||index===dieIndex).flatMap(index=>movesFor(g,g.dice[index]).map(move=>({...move,die:index,value:g.dice[index]})));
 }
 function place(g,move){
  const p=g.players[g.turn],index=ring(p,move.to),captured=[];
  if(index!==null)for(const other of occupants(g,index))if(other.seat!==g.turn){g.players[other.seat].tokens[other.piece]=-1;captured.push(other);}
  p.tokens[move.piece]=move.to;g.remaining=g.remaining.filter(index=>index!==move.die);if(captured.length)g.capturedThisRoll.push(move.piece);
  return captured;
 }
 function ordered(g){
  // Either die may be chosen first by tapping it on the table.
  return rawLegal(g);
 }
 function wouldCapture(g,move){
  const player=g.players[g.turn],index=ring(player,move.to);
  return index!==null&&occupants(g,index).some(other=>other.seat!==g.turn);
 }
 function onlyOnePieceAvailable(g){
  return g.players[g.turn].tokens.filter(progress=>progress>=0&&progress<HOME).length===1;
 }
 function canUseOtherDieOnSamePiece(g,move){
  const trial=structuredClone(g);
  const captured=place(trial,move);
  if(captured.length)return false;
  if(!trial.remaining.length)return true;
  const otherMoves=rawLegal(trial);
  return otherMoves.some(nextMove=>nextMove.piece===move.piece&&!wouldCapture(trial,nextMove));
 }
 function legal(g,dieIndex){
  // When only one piece remains outside the home/finished areas, prefer a
  // two-die route for that same piece over a capture that would waste a die.
  let choices=ordered(g);
  if(onlyOnePieceAvailable(g)&&g.remaining.length===2){
   const continuations=choices.filter(move=>!wouldCapture(g,move)&&canUseOtherDieOnSamePiece(g,move));
   if(continuations.length)choices=continuations;
  }
  return choices.filter(move=>dieIndex===undefined||move.die===dieIndex);
 }
 function note(g,message){g.history.push(message);g.history=g.history.slice(-40);}
 function completelyBarrierBlocked(g){
  const pieces=g.players[g.turn].tokens;
  // Only auto-pass before rolling when all four pieces are on the track and
  // no possible die (1 through 6) could get any of them past the barrier.
  return pieces.every(progress=>progress>=0&&progress<HOME)
   &&![1,2,3,4,5,6].some(die=>movesFor(g,die).length);
 }
 function next(g){
  g.turn=(g.turn+1)%g.players.length;g.phase='roll';g.remaining=[];g.capturedThisRoll=[];g.bonus=false;
  // Avoid an endless loop when every player is trapped.
  for(let checked=0;checked<g.players.length&&completelyBarrierBlocked(g);checked++){
   const blocked=g.players[g.turn];
   note(g,blocked.name+' is completely blocked by a barrier. Automatic pass.');
   g.last={type:'pass',seat:g.turn,reason:'barrier'};
   g.turn=(g.turn+1)%g.players.length;
  }
 }
 function act(state,seat,action,rollDie=()=>Math.floor(Math.random()*6)+1){
  if(!action||typeof action!=='object')throw Error('Invalid action.');
  if(state.phase==='over')throw Error('This game is finished. Start a new game.');
  if(!Number.isInteger(seat)||seat!==state.turn)throw Error('Wait for your turn.');
  const g=structuredClone(state),p=g.players[seat];
  if(action.type==='roll'){
   if(g.phase!=='roll')throw Error('Use the remaining dice before rolling again.');
   if(completelyBarrierBlocked(g)){note(g,p.name+' is completely blocked by a barrier. Automatic pass.');g.last={type:'pass',seat,reason:'barrier'};next(g);return g;}
   const dice=[rollDie(),rollDie()];if(dice.some(die=>!Number.isInteger(die)||die<1||die>6))throw Error('Invalid dice result.');
   g.dice=dice;g.remaining=[0,1];g.capturedThisRoll=[];g.rollNo++;g.bonus=dice.includes(6);g.last={type:'roll',seat,dice:dice.slice()};
   note(g,p.name+' rolled '+dice[0]+' and '+dice[1]+'.');
   g.phase='move';
   if(!legal(g).length){note(g,rawLegal(g).length?'No legal move can preserve the other die. Turn passes without capturing.':p.name+' has no available move with either die. Turn passes.');next(g);}
   return g;
  }
  if(action.type!=='move'||g.phase!=='move')throw Error('Roll the dice first.');
  let die=action.die;
  if(die===undefined){
   const choices=legal(g).filter(move=>move.piece===action.piece);
   if(new Set(choices.map(move=>move.value)).size>1)throw Error('Choose which die to use.');
   die=choices[0]?.die;
  }
  const move=legal(g,die).find(m=>m.piece===action.piece&&m.die===die);
  if(!move){
   if(rawLegal(g,die).some(m=>m.piece===action.piece&&m.die===die)){
    throw Error('Use both dice when possible. Choose a move that keeps the other die playable.');
   }
   throw Error('Choose an available piece and an unused die.');
  }
  const captured=place(g,move);
  g.last={type:'move',seat,piece:move.piece,die,value:move.value,from:move.from,to:move.to,captured};
  note(g,p.name+' used die '+(die+1)+' ('+move.value+') to move piece '+(move.piece+1)+(move.to===HOME?' home':move.from<0?' onto the board':' '+move.value+' spaces')+(captured.length?' and captured '+captured.length+' piece'+(captured.length===1?'':'s'):'')+'.');
  if(p.tokens.every(n=>n===HOME)){g.phase='over';g.winner=seat;g.remaining=[];note(g,p.name+' wins! All four pieces are home.');return g;}
  if(legal(g).length)return g;
  if(g.remaining.length)note(g,p.name+' cannot use the remaining die.');
  g.remaining=[];
  if(g.bonus){g.phase='roll';note(g,p.name+' rolls again.');}
  else next(g);
  return g;
 }
 const api={TEAMS,TRACK,HOME,OUTER_LAST,cleanName,fresh,ring,coordinate,legal,act};
 if(typeof module!=='undefined')module.exports=api;else root.JVLUDI=api;
})(globalThis);
