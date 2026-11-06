(function(root){
 'use strict';
 const VERSION='ludi-feedback-reports-20261106';
 const text=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
 const integer=(v,min=-1000000,max=1000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 function state(g){
  if(!g||!Array.isArray(g.players)||g.players.length<2||g.players.length>4)throw Error('The board could not be captured.');
  const players=g.players.map(p=>{
   if(!p||!integer(p.color,0,3)||!Array.isArray(p.tokens)||p.tokens.length!==4||!p.tokens.every(n=>integer(n)))throw Error('The pieces could not be captured.');
   return {name:text(p.name,24),color:p.color,tokens:p.tokens.slice()};
  });
  if(!integer(g.turn,0,3)||!Array.isArray(g.dice)||g.dice.length!==2||!g.dice.every(n=>n===null||integer(n))||!Array.isArray(g.remaining)||g.remaining.length>2||!g.remaining.every(n=>integer(n,0,1)))throw Error('The dice could not be captured.');
  const last=g.last?{type:text(g.last.type,20),reason:text(g.last.reason,80),dice:Array.isArray(g.last.dice)?g.last.dice.slice(0,2).map(n=>integer(n)?n:null):[],seat:integer(g.last.seat)?g.last.seat:null,piece:integer(g.last.piece)?g.last.piece:null,die:integer(g.last.die)?g.last.die:null,value:integer(g.last.value)?g.last.value:null,from:integer(g.last.from)?g.last.from:null,to:integer(g.last.to)?g.last.to:null,captured:Array.isArray(g.last.captured)?g.last.captured.slice(0,16).map(p=>({seat:integer(p.seat)?p.seat:null,piece:integer(p.piece)?p.piece:null})):[]}:null;
  return {players,turn:g.turn,phase:text(g.phase,20),dice:g.dice.slice(),remaining:g.remaining.slice(),capturedThisRoll:Array.isArray(g.capturedThisRoll)?g.capturedThisRoll.filter(n=>integer(n,0,3)).slice(0,4):[],rollNo:integer(g.rollNo,0)?g.rollNo:0,bonus:!!g.bonus,winner:integer(g.winner,0,3)?g.winner:null,last,history:Array.isArray(g.history)?g.history.slice(-40).map(s=>text(s,240)):[]};
 }
 function clean(input){
  if(!input||typeof input!=='object'||!integer(input.capturedAt,0,10000000000000))throw Error('Invalid problem report.');
  const trace=[];
  if(Array.isArray(input.trace))for(const item of input.trace.slice(-8)){
   if(!item||!integer(item.at,0,10000000000000))continue;
   try{trace.push({at:item.at,revision:integer(item.revision,0)?item.revision:null,state:state(item.state)})}catch{}
  }
  const attempt=input.lastAttempt;
  return {formatVersion:1,build:text(input.build,80),capturedAt:input.capturedAt,mode:text(input.mode,20),roomCode:typeof input.roomCode==='string'&&/^[A-F0-9]{8}$/.test(input.roomCode)?input.roomCode:null,revision:integer(input.revision,0)?input.revision:null,selectedDie:integer(input.selectedDie,0,1)?input.selectedDie:null,description:text(input.description,1000),state:state(input.state),trace,lastAttempt:attempt?{at:integer(attempt.at,0,10000000000000)?attempt.at:null,type:text(attempt.type,20),piece:integer(attempt.piece,0,3)?attempt.piece:null,die:integer(attempt.die,0,1)?attempt.die:null,reason:text(attempt.reason,240)}:null,device:{width:integer(input.device?.width,0,20000)?input.device.width:0,height:integer(input.device?.height,0,20000)?input.device.height:0,userAgent:text(input.device?.userAgent,240)}};
 }
 const api={VERSION,state,clean};if(typeof module!=='undefined')module.exports=api;else root.JVLudiReport=api;
})(globalThis);
