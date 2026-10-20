(function(root){
 'use strict';
 const RANKS={11:'J',12:'Q',13:'K',14:'A'};
 const face=c=>c?(RANKS[c.rank]||String(c.rank))+c.suit:'—';
 function pairWin(hand,rank){if(hand.length!==3)return false;const matches=hand.filter(c=>c.rank===rank),rest=hand.filter(c=>c.rank!==rank);return matches.length===1&&rest.length===2&&rest[0].rank===rest[1].rank;}
 function deck(random=Math.random){const d=[];for(const suit of ['♠','♥','♦','♣'])for(let rank=2;rank<=14;rank++)d.push({id:suit+rank,rank,suit});for(let i=d.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
 class Game{
  constructor(names,total=5,random=Math.random){
   if(!Array.isArray(names)||names.length<2||names.length>4)throw Error('Choose 2–4 players.');
   if(!Number.isInteger(total)||total<5||total%5||total>1000)throw Error('Choose games in multiples of 5, up to 1000.');
   this.players=names.map(name=>({name:String(name).slice(0,20),score:0,hand:[]}));this.total=total;this.completed=0;this.random=random;this.dealer=null;this.history=[];this.beginPicker();
  }
  note(text){this.message=text;this.history.push(text);if(this.history.length>80)this.history.shift();}
  beginPicker(){this.stock=null;this.pile=[];this.players.forEach(p=>p.hand=[]);this.phase='pick';this.pickDeck=deck(this.random);this.picks=Array(this.players.length).fill(null);this.pickSeats=this.players.map((_,i)=>i);this.turn=null;this.note('Everyone picks a card. Highest card deals. Ace is high; tied highest players pick again.');}
  pick(seat){
   if(this.phase!=='pick'||!this.pickSeats.includes(seat)||this.picks[seat])return false;
   const card=this.pickDeck.pop();this.picks[seat]=card;
   if(this.pickSeats.every(i=>this.picks[i])){
    const high=Math.max(...this.pickSeats.map(i=>this.picks[i].rank)),ties=this.pickSeats.filter(i=>this.picks[i].rank===high);
    if(ties.length>1){this.pickSeats=ties;this.pickDeck=deck(this.random);ties.forEach(i=>this.picks[i]=null);this.note('Highest cards tied. Those players pick again.');}
    else{this.dealer=ties[0];this.phase='deal';this.note(this.players[this.dealer].name+' picked the highest card and deals next.');}
   }
   return true;
  }
  deal(seat){
   if(this.phase!=='deal'||seat!==this.dealer)return false;
   this.stock=deck(this.random);this.pile=[];this.players.forEach(p=>p.hand=[]);this.bonus=0;this.winner=null;this.drawn=false;
   for(let c=0;c<3;c++)for(let n=1;n<=this.players.length;n++)this.players[(this.dealer+n)%this.players.length].hand.push(this.stock.pop());
   const trump=this.stock.pop();this.opening=trump;this.pile.push(trump);
   if(trump.rank===6||trump.rank===11){this.bonus=this.players.length;this.players[this.dealer].score+=this.bonus;this.note(this.players[this.dealer].name+' turns up '+face(trump)+' and gets '+this.bonus+' bonus points.');}
   else this.note(this.players[this.dealer].name+' turns up '+face(trump)+'.');
   this.nextDrawer=(this.dealer+2)%this.players.length;this.offer((this.dealer+1)%this.players.length);return true;
  }
  offer(start){this.phase='offer';this.queue=Array.from({length:this.players.length},(_,i)=>(start+i)%this.players.length);this.seek();}
  seek(){
   const rank=this.pile[this.pile.length-1].rank;
   while(this.queue.length&&!this.players[this.queue[0]].hand.some(c=>c.rank===rank))this.queue.shift();
   if(this.queue.length){this.turn=this.queue[0];this.note(this.players[this.turn].name+' can use '+face(this.pile[this.pile.length-1])+'.');}
   else{this.phase='draw';this.turn=this.nextDrawer;this.note(this.players[this.turn].name+' draws next.');if(!this.stock.length)this.finish(null);}
  }
  pass(seat){if(this.phase!=='offer'||seat!==this.turn)return false;this.note(this.players[seat].name+' declines the card.');this.queue.shift();this.seek();return true;}
  play(seat,matchId,otherId){
   if(this.phase!=='offer'||seat!==this.turn)return false;
   const hand=this.players[seat].hand,m=hand.find(c=>c.id===matchId),target=this.pile[this.pile.length-1];
   if(!m||m.rank!==target.rank)return false;
   if(pairWin(hand,target.rank)){this.players[seat].hand=hand.filter(c=>c!==m);this.pile.push(m);this.note(this.players[seat].name+' plays '+face(m)+' and wins with a pair remaining.');this.finish(seat);return true;}
   const other=hand.find(c=>c.id===otherId);
   if(hand.length>1&&(!other||other===m))return false;
   this.players[seat].hand=hand.filter(c=>c!==m&&c!==other);this.pile.push(m);if(hand.length>1)this.pile.push(other);
   this.note(this.players[seat].name+' plays '+face(m)+(hand.length>1?' + '+face(other):'')+'.');
   if(!this.players[seat].hand.length){this.finish(seat);return true;}
   this.nextDrawer=(seat+1)%this.players.length;this.offer((seat+1)%this.players.length);return true;
  }
  draw(seat){if(this.phase!=='draw'||seat!==this.turn||!this.stock.length)return false;const card=this.stock.pop();this.pile.push(card);this.drawn=true;this.note(this.players[seat].name+' draws '+face(card)+'.');this.nextDrawer=(seat+1)%this.players.length;this.offer(seat);return true;}
  finish(winner){
   this.completed++;this.winner=winner;this.turn=null;this.phase=this.completed===this.total?'session-over':'hand-over';
   if(winner===null){this.needsPick=true;this.note('Deck finished. No hand points; dealer keeps any bonus. This game counts. Pick again for the next dealer.');}
   else{this.players.forEach((p,i)=>p.score+=i===winner?1:-1);this.dealer=winner;this.needsPick=false;this.note(this.players[winner].name+' wins: +1 point. Every other player: −1. Winner deals next.');}
  }
  next(){if(this.phase!=='hand-over')return false;if(this.needsPick)this.beginPicker();else{this.phase='deal';this.note(this.players[this.dealer].name+' won and deals next.');}return true;}
  extend(amount){if(this.phase!=='session-over'||!Number.isInteger(amount)||amount<5||amount%5||this.total+amount>1000)return false;this.total+=amount;this.phase='hand-over';return this.next();}
  view(seat){return {players:this.players.map((p,i)=>({name:p.name,score:p.score,count:p.hand.length,hand:i===seat?p.hand:[]})),total:this.total,completed:this.completed,phase:this.phase,turn:this.turn,dealer:this.dealer,picks:this.picks,pickSeats:this.pickSeats,opening:this.opening||null,top:this.pile?.at(-1)||null,recent:this.pile?.slice(-4)||[],remaining:this.stock?.length||0,bonus:this.bonus||0,winner:this.winner,message:this.message,history:this.history.slice(-12)};}
 }
 const api={Game,deck,face,pairWin};root.JVThreeCards=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
