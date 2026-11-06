(function(root){
 'use strict';
 const E=typeof module!=='undefined'?require('./engine'):root.JVLUDI;
 const steps=[
  {title:'Enter with a six',text:'Roll the dice, choose the six, then tap a glowing green piece to bring it out.'},
  {title:'Use both dice',text:'Now use the three to move your piece. You must use both dice when legal moves allow it.'},
  {title:'Capture a lone piece',text:'Your three lands on the lone black piece. Tap your glowing green piece to capture it. A capturing piece stops for the rest of that roll.'},
  {title:'Respect the barrier',text:'Two black pieces form a protected barrier. Your first piece cannot pass it. Move the other glowing green piece instead.'},
  {title:'Finish with the exact number',text:'Three pieces are home. Choose the two and move your last piece home. A three would overshoot.'}
 ];
 function scenario(step){
  const g=E.fresh(['Player','Practice opponent']);
  if(step<2)return g;
  g.phase='move';g.rollNo=step;g.remaining=[0];g.dice=[3,1];
  if(step===2){g.players[0].tokens[0]=4;g.players[1].tokens[0]=31}
  if(step===3){g.players[0].tokens=[4,15,-1,-1];g.players[1].tokens=[31,31,-1,-1];g.dice=[4,2]}
  if(step===4){g.players[0].tokens=[E.HOME,E.HOME,E.HOME,E.HOME-2];g.dice=[2,3];g.remaining=[0,1]}
  g.history=['Guided practice · '+steps[step].title];return g;
 }
 function advance(step,g){
  if(step===0&&g.last?.type==='move'&&g.last.from<0)return 1;
  if(step===1&&g.last?.type==='move'&&!g.remaining.length)return 2;
  if(step===2&&g.last?.captured?.length)return 3;
  if(step===3&&g.last?.type==='move'&&g.last.piece===1)return 4;
  if(step===4&&g.phase==='over')return 5;
  return step;
 }
 const api={steps,scenario,advance};if(typeof module!=='undefined')module.exports=api;else root.JVLudiTutorial=api;
})(globalThis);
