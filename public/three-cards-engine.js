(function(root){
 'use strict';
 const RANKS={11:'J',12:'Q',13:'K',14:'A'};
 const face=c=>c?(RANKS[c.rank]||String(c.rank))+c.suit:'—';
 // Calls are evaluated independently of the rank-matching hand win.
 // "Flush, straight and threes" is the owner's special category name.
 function evaluateCall(hand){
  if(!Array.isArray(hand)||hand.length!==3)return null;
  const ranks=hand.map(c=>c.rank).sort((a,b)=>b-a);
  const threes=ranks[0]===ranks[2];
  const twoJacks=ranks.join(',')==='11,11,6',twoSixes=ranks.join(',')==='11,6,6';
  if(threes||twoJacks||twoSixes)return {name:'Flush, straight and threes',points:3,key:[4,threes?3:twoJacks?2:1,...ranks]};
  const flush=hand.every(c=>c.suit===hand[0].suit);
  // Ace can end Q-K-A or start A-2-3. K-A-2 is not consecutive.
  const lowAce=ranks.join(',')==='14,3,2';
  const straight=lowAce||(ranks[0]===ranks[1]+1&&ranks[1]===ranks[2]+1);
  const category=flush&&straight?3:flush?2:straight?1:0;
  if(!category)return null;
  return {name:category===3?'Flush and straight':flush?'Flush':'Straight',points:category===3?2:1,key:[category,...(lowAce&&straight?[3,2,1]:ranks)]};
 }
 function compareCalls(a,b){
  const left=a?.key||[0],right=b?.key||[0];
  for(let i=0;i<Math.max(left.length,right.length);i++){const difference=(left[i]||0)-(right[i]||0);if(difference)return Math.sign(difference);}
  return 0;
 }
 // Pure result: only non-winners pay; equally ranked winners share the pool.
 function callResult(hands,declaredSeats){
  if(!Array.isArray(declaredSeats)||new Set(declaredSeats).size!==declaredSeats.length||declaredSeats.some(i=>!Number.isInteger(i)||i<0||i>=hands.length))throw Error('Invalid call declarations.');
  let best=null,winners=[];
  for(const seat of declaredSeats){const call=evaluateCall(hands[seat]);if(!call)continue;const comparison=compareCalls(call,best);if(comparison>0){best=call;winners=[seat];}else if(comparison===0)winners.push(seat);}
  const deltas=hands.map(()=>0);
  if(winners.length){deltas.fill(-best.points);const share=best.points*(hands.length-winners.length)/winners.length;for(const seat of winners)deltas[seat]=share;}
  return {call:best,winners,tied:winners.length>1,deltas};
 }
 function scoreText(value){
  const units=Math.round(Math.abs(value)*6),whole=Math.floor(units/6),part=['','⅙','⅓','½','⅔','⅚'][units%6];
  return (value<0?'−':value>0?'+':'')+(whole||!part?String(whole):'')+part;
 }
 function pairSingle(hand){if(hand.length!==3)return null;return hand.find(c=>hand.filter(other=>other.rank===c.rank).length===1&&hand.some(other=>other.rank!==c.rank&&hand.filter(p=>p.rank===other.rank).length===2))||null;}
 function pairWin(hand,rank){if(hand.length!==3)return false;const matches=hand.filter(c=>c.rank===rank),rest=hand.filter(c=>c.rank!==rank);return matches.length===1&&rest.length===2&&rest[0].rank===rest[1].rank;}
 function deck(random=Math.random){const d=[];for(const suit of ['♠','♥','♦','♣'])for(let rank=2;rank<=14;rank++)d.push({id:suit+rank,rank,suit});for(let i=d.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
 class Game{
  constructor(names,total=5,random=Math.random){
   if(!Array.isArray(names)||names.length<2||names.length>4)throw Error('Choose 2–4 players.');
   if(!Number.isInteger(total)||total<5||total%5||total>1000)throw Error('Choose games in multiples of 5, up to 1000.');
   this.players=names.map(name=>({name:String(name).slice(0,20),score:0,hand:[],played:[]}));this.total=total;this.completed=0;this.random=random;this.dealer=null;this.history=[];this.beginPicker();
  }
  note(text){this.message=text;this.history.push(text);if(this.history.length>80)this.history.shift();}
  beginPicker(){this.winningHand=[];this.winner=null;this.declarations=null;this.callSummary=null;this.stock=null;this.pile=[];this.players.forEach(p=>{p.hand=[];p.played=[];});this.phase='pick';this.pickDeck=deck(this.random);this.picks=Array(this.players.length).fill(null);this.pickSeats=this.players.map((_,i)=>i);this.turn=null;this.note('Everyone picks a card. Highest card deals. Ace is high; tied highest players pick again.');}
  pick(seat){
   if(this.phase!=='pick'||!this.pickSeats.includes(seat)||this.picks[seat])return false;
   const card=this.pickDeck.pop();this.picks[seat]=card;
   if(this.pickSeats.every(i=>this.picks[i])){
    const high=Math.max(...this.pickSeats.map(i=>this.picks[i].rank)),ties=this.pickSeats.filter(i=>this.picks[i].rank===high);
    if(ties.length>1){this.pickSeats=ties;this.pickDeck=deck(this.random);this.picks.fill(null);this.note('Highest cards tied. Those players pick again.');}
    else{this.dealer=ties[0];this.phase='deal';this.note(this.players[this.dealer].name+' picked the highest card and deals next.');}
   }
   return true;
  }
  deal(seat){
   if(this.phase!=='deal'||seat!==this.dealer)return false;
   this.stock=deck(this.random);this.pile=[];this.players.forEach(p=>{p.hand=[];p.played=[];});this.bonus=0;this.winner=null;this.winningHand=[];this.drawn=false;
   for(let c=0;c<3;c++)for(let n=1;n<=this.players.length;n++)this.players[(this.dealer+n)%this.players.length].hand.push(this.stock.pop());
   const trump=this.stock.pop();this.opening=trump;this.pile.push(trump);
   if(trump.rank===6||trump.rank===11){this.bonus=this.players.length;this.players[this.dealer].score+=this.bonus;this.note(this.players[this.dealer].name+' turns up '+face(trump)+' and gets '+this.bonus+' bonus points.');}
   else this.note(this.players[this.dealer].name+' turns up '+face(trump)+'.');
   this.nextDrawer=(this.dealer+2)%this.players.length;this.declarations=this.players.map(()=>null);this.callSummary=null;this.phase='declare';this.turn=null;this.note('The game checks every hand for calls automatically.');this.players.forEach((p,i)=>this.declare(i,!!evaluateCall(p.hand)));return true;
  }
  declare(seat,claim){
   if(this.phase!=='declare'||!Number.isInteger(seat)||!this.players[seat]||this.declarations[seat]!==null||typeof claim!=='boolean')return false;
   const call=evaluateCall(this.players[seat].hand);
   if(claim&&!call)return false;
   this.declarations[seat]=claim;
   // Do not expose a claim's rank or cards while opponents are deciding.
   this.note(this.players[seat].name+' is ready. Waiting for all declarations.');
   if(this.declarations.every(value=>value!==null)){
    const result=callResult(this.players.map(p=>p.hand),this.declarations.flatMap((value,i)=>value?[i]:[]));
    this.players.forEach((p,i)=>p.score=Math.round((p.score+result.deltas[i])*6)/6);
    this.callSummary={name:result.call?.name||null,points:result.call?.points||0,winners:result.winners,deltas:result.deltas,tied:result.tied,calls:this.players.map((p,seat)=>result.winners.includes(seat)?{name:result.call.name,points:result.call.points}:null),hands:result.winners.map(seat=>({seat,cards:this.players[seat].hand.slice()}))};
    const names=result.winners.map(i=>this.players[i].name).join(' & ');
    this.note(result.call?names+(result.tied?' share ':' wins ')+result.call.name+'. '+result.deltas.map((delta,i)=>this.players[i].name+' '+scoreText(delta)).join('; ')+'. Matching-card play continues.':'No calls declared. Matching-card play continues.');
    this.offer((this.dealer+1)%this.players.length);
   }
   return true;
  }
  offer(start){this.phase='offer';this.queue=Array.from({length:this.players.length},(_,i)=>(start+i)%this.players.length);this.seek();}
  seek(){
   const rank=this.pile[this.pile.length-1].rank;
   while(this.queue.length&&(!this.players[this.queue[0]].hand.some(c=>c.rank===rank)||(pairSingle(this.players[this.queue[0]].hand)&&!pairWin(this.players[this.queue[0]].hand,rank))))this.queue.shift();
   if(this.queue.length){this.turn=this.queue[0];this.note(this.players[this.turn].name+' can use '+face(this.pile[this.pile.length-1])+'.');}
   else{this.phase='draw';this.turn=this.nextDrawer;this.note(this.players[this.turn].name+' draws next.');if(!this.stock.length)this.finish(null);}
  }
  pass(seat){if(this.phase!=='offer'||seat!==this.turn)return false;this.note(this.players[seat].name+' declines the card.');this.queue.shift();this.seek();return true;}
  play(seat,matchId,otherId){
   if(this.phase!=='offer'||seat!==this.turn)return false;
   const hand=this.players[seat].hand,m=hand.find(c=>c.id===matchId),target=this.pile[this.pile.length-1];
   if(!m||m.rank!==target.rank||(pairSingle(hand)&&!pairWin(hand,target.rank)))return false;
   if(pairWin(hand,target.rank)){this.players[seat].played.push(...hand.filter(c=>c!==m),m);this.winningHand=hand.slice();this.pile.push(...hand.filter(c=>c!==m),m);this.players[seat].hand=[];this.note(this.players[seat].name+' clears all three cards, matching '+face(m)+' to win with a pair.');this.finish(seat);return true;}
   const other=hand.find(c=>c.id===otherId);
   if(hand.length>1&&(!other||other===m))return false;
   this.players[seat].played.push(m);if(hand.length>1)this.players[seat].played.push(other);
   this.players[seat].hand=hand.filter(c=>c!==m&&c!==other);this.pile.push(m);if(hand.length>1)this.pile.push(other);
   this.note(this.players[seat].name+' plays '+face(m)+(hand.length>1?' + '+face(other):'')+'.');
   if(!this.players[seat].hand.length){this.winningHand=hand.slice();this.finish(seat);return true;}
   this.nextDrawer=(seat+1)%this.players.length;this.offer((seat+1)%this.players.length);return true;
  }
  draw(seat){if(this.phase!=='draw'||seat!==this.turn||!this.stock.length)return false;const card=this.stock.pop();this.pile.push(card);this.drawn=true;this.note(this.players[seat].name+' draws '+face(card)+'.');this.nextDrawer=(seat+1)%this.players.length;this.offer(seat);return true;}
  finish(winner){
   this.completed++;this.winner=winner;this.turn=null;this.phase=this.completed===this.total?'session-over':'hand-over';
   if(winner===null){this.needsPick=true;this.note('Deck finished. No hand points; call points and dealer bonus are kept. This game counts. Pick again for the next dealer.');}
   else{this.players.forEach((p,i)=>p.score=Math.round((p.score+(i===winner?this.players.length-1:-1))*6)/6);this.dealer=winner;this.needsPick=false;this.note(this.players[winner].name+' wins: +'+(this.players.length-1)+' ('+'1 point from each opponent). Every other player: −1. Winner deals next.');}
  }
  next(){if(this.phase!=='hand-over')return false;if(this.needsPick)this.beginPicker();else{this.players.forEach(p=>p.played=[]);this.phase='deal';this.note(this.players[this.dealer].name+' won and deals next.');}return true;}
  extend(amount){if(this.phase!=='session-over'||!Number.isInteger(amount)||amount<5||amount%5||this.total+amount>1000)return false;this.total+=amount;this.phase='hand-over';return this.next();}
  view(seat){return {declarations:this.declarations?.map(value=>value===null?null:true)||null,callSummary:this.callSummary?{...this.callSummary,hands:['hand-over','session-over'].includes(this.phase)?this.callSummary.hands.map(h=>({seat:h.seat,cards:h.cards.slice()})):[]}:null,players:this.players.map((p,i)=>({name:p.name,score:p.score,count:p.hand.length,played:p.played.map(c=>({...c})),hand:i===seat?p.hand:[]})),total:this.total,completed:this.completed,phase:this.phase,turn:this.turn,dealer:this.dealer,picks:this.picks,pickSeats:this.pickSeats,opening:this.opening||null,top:this.pile?.at(-1)||null,recent:this.pile?.slice(-4)||[],remaining:this.stock?.length||0,bonus:this.bonus||0,winner:this.winner,winningHand:['hand-over','session-over'].includes(this.phase)?this.winningHand.slice():[],message:this.message,history:this.history.slice(-12)};}
 }
 const api={Game,deck,face,pairSingle,pairWin,evaluateCall,compareCalls,callResult,scoreText};root.JVThreeCards=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
