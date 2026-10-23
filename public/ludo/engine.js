(function(root){
 'use strict';
 const TEAMS=[{name:'Kingston',color:'#10964b',start:1},{name:'Cornwall',color:'#202924',start:14},{name:'Middlesex',color:'#e84444',start:27},{name:'Surrey',color:'#fed100',start:40}];
 const TRACK=[[6,0],[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0]];
 const SAFE=[1,9,14,22,27,35,40,48],HOME=56;
 const cleanName=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim().slice(0,24):'';
 function fresh(names){
  if(!Array.isArray(names)||names.length<2||names.length>4||names.some(n=>!cleanName(n)))throw Error('Enter names for 2, 3, or 4 players.');
  const colors=names.length===2?[0,2]:names.map((_,i)=>i);
  return {players:names.map((name,i)=>({name:cleanName(name),color:colors[i],tokens:[-1,-1,-1,-1]})),turn:0,phase:'roll',die:null,sixes:0,winner:null,last:null,history:['Roll a six to bring a piece out.']};
 }
 function ring(player,progress){return progress>=0&&progress<=50?(TEAMS[player.color].start+progress)%52:null;}
 function coordinate(player,progress){
  if(progress<0)return null;if(progress===HOME)return [7,7];
  if(progress<=50)return TRACK[ring(player,progress)];
  const n=progress-50;return player.color===0?[7,n]:player.color===1?[n,7]:player.color===2?[7,14-n]:[14-n,7];
 }
 function occupants(g,index){return g.players.flatMap((p,seat)=>p.tokens.flatMap((progress,piece)=>ring(p,progress)===index?[{seat,piece}]:[]));}
 function legal(g){
  if(g.phase!=='move')return [];
  const player=g.players[g.turn],die=g.die;
  return player.tokens.flatMap((from,piece)=>{
   if(from===HOME||from<0&&die!==6)return [];
   const to=from<0?0:from+die;if(to>HOME)return [];
   for(let step=from<0?0:from+1;step<=Math.min(to,50);step++){
    const index=ring(player,step),on=occupants(g,index);
    if(g.players.some((_,seat)=>seat!==g.turn&&on.filter(t=>t.seat===seat).length>=2))return [];
   }
   const target=ring(player,to);
   if(target!==null&&occupants(g,target).filter(t=>t.seat===g.turn).length>=2)return [];
   return [{piece,from,to}];
  });
 }
 function note(g,message){g.history.push(message);g.history=g.history.slice(-40);}
 function next(g){g.turn=(g.turn+1)%g.players.length;g.phase='roll';g.sixes=0;}
 function act(state,seat,action,rollDie=()=>Math.floor(Math.random()*6)+1){
  if(!action||typeof action!=='object')throw Error('Invalid action.');
  if(state.phase==='over')throw Error('This game is finished. Start a new game.');
  if(!Number.isInteger(seat)||seat!==state.turn)throw Error('Wait for your turn.');
  const g=structuredClone(state),p=g.players[seat];
  if(action.type==='roll'){
   if(g.phase!=='roll')throw Error('Choose a piece before rolling again.');
   const die=rollDie();if(!Number.isInteger(die)||die<1||die>6)throw Error('Invalid dice result.');
   g.die=die;g.sixes=die===6?g.sixes+1:0;g.last={type:'roll',seat,die};
   note(g,p.name+' rolled '+die+'.');
   if(g.sixes===3){note(g,'Three sixes: '+p.name+' loses this turn.');next(g);return g;}
   g.phase='move';
   if(!legal(g).length){note(g,p.name+' has no available move. Turn passes.');next(g);}
   return g;
  }
  if(action.type!=='move'||g.phase!=='move')throw Error('Roll the dice first.');
  const move=legal(g).find(m=>m.piece===action.piece);if(!move)throw Error('Choose one of the available pieces.');
  const index=ring(p,move.to),captured=[];
  if(index!==null&&!SAFE.includes(index)){
   for(const other of occupants(g,index))if(other.seat!==seat){g.players[other.seat].tokens[other.piece]=-1;captured.push(other);}
  }
  p.tokens[move.piece]=move.to;g.last={type:'move',seat,piece:move.piece,from:move.from,to:move.to,captured};
  note(g,p.name+' moved piece '+(move.piece+1)+(move.to===HOME?' home':move.from<0?' onto the board':' '+g.die+' spaces')+(captured.length?' and captured '+captured.length+' piece'+(captured.length===1?'':'s'):'')+'.');
  if(p.tokens.every(n=>n===HOME)){g.phase='over';g.winner=seat;note(g,p.name+' wins! All four pieces are home.');return g;}
  if(g.die===6||captured.length){g.phase='roll';if(g.die!==6)g.sixes=0;note(g,p.name+' rolls again.');}
  else next(g);
  return g;
 }
 const api={TEAMS,TRACK,SAFE,HOME,cleanName,fresh,ring,coordinate,legal,act};
 if(typeof module!=='undefined')module.exports=api;else root.JVLudo=api;
})(globalThis);
