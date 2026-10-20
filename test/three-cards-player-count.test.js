const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),{Server}=require('socket.io'),{io:connect}=require('socket.io-client');
const {installThreeCards}=require('../three-cards-online');
function wait(s,event,predicate=()=>true){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(event,handler);reject(Error('Timeout '+event));},4000);function handler(value){if(predicate(value)){clearTimeout(timer);s.off(event,handler);resolve(value);}}s.on(event,handler);});}
for(const count of [2,3])test(`${count} online players complete calls and a hand; scores scale with table size`,async()=>{
 const server=http.createServer(),io=new Server(server);installThreeCards(io);const clients=[];
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(let i=0;i<count;i++){
   const socket=connect(`http://127.0.0.1:${server.address().port}/three-cards`,{transports:['websocket'],forceNew:true});
   socket.on('state',state=>socket.current=state);clients.push(socket);await wait(socket,'connect');
   const update=wait(socket,'state');socket.emit(i?'join':'create',{name:'P'+i,total:5,code:clients[0].current?.code});await update;
  }
  const command=async(socket,type,data)=>{await new Promise(resolve=>setTimeout(resolve,45));const updates=clients.map(client=>wait(client,'state'));socket.emit(type,data);await Promise.all(updates);};
  for(const client of clients)await command(client,'ready');await command(clients[0],'start');
  let guard=0;while(clients[0].current.game.phase==='pick'&&guard++<30){const g=clients[0].current.game;const seat=g.pickSeats.find(i=>!g.picks[i]);await command(clients[seat],'action',{type:'pick'});}
  let g=clients[0].current.game;await command(clients[g.dealer],'action',{type:'deal'});
  g=clients[0].current.game;assert.equal(g.players.length,count);assert.equal(g.phase,'declare');
  const expectedBonus=[6,11].includes(g.opening.rank)?count:0;assert.equal(g.bonus,expectedBonus);assert.equal(g.players[g.dealer].score,expectedBonus);
  for(let i=0;i<count;i++)await command(clients[i],'action',{type:'declare',claim:false});
  guard=0;while(!['hand-over','session-over'].includes(clients[0].current.game.phase)&&guard++<300){
   g=clients[0].current.game;const seat=g.turn;let action;
   if(g.phase==='draw')action={type:'draw'};
   else {const hand=clients[seat].current.game.players[seat].hand,match=hand.find(c=>c.rank===g.top.rank),other=hand.find(c=>c!==match);action={type:'play',match:match.id,other:other?.id};}
   await command(clients[seat],'action',action);
  }
  g=clients[0].current.game;assert.equal(g.completed,1);assert.deepEqual(g.callSummary.deltas,Array(count).fill(0));
  assert(g.players.every(p=>Number.isFinite(p.score)));
 }finally{clients.forEach(c=>c.disconnect());await new Promise(resolve=>io.close(resolve));}
});
