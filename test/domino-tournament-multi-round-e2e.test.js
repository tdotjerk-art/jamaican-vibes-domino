'use strict';
// Development-only: actual Socket.IO gameplay drives both tournament rounds.
// All accounts, fixtures and credits live in a temporary isolated SQLite DB.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');
const {io}=require('socket.io-client');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('three entrants play real first-round match, bye advances, and final produces champion without extra debit',
  {timeout:480000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'domino-tournament-rounds-'));
  const secret='m'.repeat(48);
  const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
    env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',
      DOMINO_CREDIT_STORAGE:'sqlite',DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),
      DOMINO_TOURNAMENT_ADMIN_TOKEN:secret},
    stdio:['ignore','ignore','pipe','ipc']
  });
  const sockets=[];
  t.after(()=>{
    for(const s of sockets)s.disconnect();
    child.kill();
    // File removal is best-effort after process shutdown on Windows.
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('server startup timeout')),12000);
    child.once('message',msg=>{clearTimeout(timer);resolve(msg.port)});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code))});
  });
  const url='http://127.0.0.1:'+port;
  async function api(route,body={},admin=false,method='POST'){
    const response=await fetch(url+'/api/domino/wallet/'+route,{
      method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+secret}:{})},
      ...(method==='GET'?{}:{body:JSON.stringify(body)})
    });
    const data=await response.json();
    assert.equal(response.status,200,route+': '+JSON.stringify(data));
    return data;
  }
  function event(socket,name,pred=()=>true){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{socket.off(name,on);reject(Error('timeout '+name))},12000);
      function on(value){if(!pred(value))return;clearTimeout(timer);socket.off(name,on);resolve(value)}
      socket.on(name,on);
    });
  }
  async function connect(){
    const s=io(url,{transports:['websocket'],forceNew:true,reconnection:false});
    sockets.push(s);await event(s,'connect');return s;
  }
  const players=[];
  for(const name of ['RoundOneA','RoundOneB','FinalByeC'])players.push(await api('register',{name}));
  await api('tournaments',{id:'rounds_e2e',capacity:3,playerCount:2},true);
  for(const p of players)await api('tournaments/rounds_e2e/join',{id:p.account.id,token:p.token});
  const seeded=await api('tournaments/rounds_e2e/start',{},true);
  assert.equal(seeded.status,'started');
  assert.deepEqual(seeded.matches.map(m=>m.status),['pending','bye']);
  assert.equal(seeded.matches[1].winnerId,players[2].account.id);

  const ends=board=>!board.length?[null,null]:[board[0].a,board[board.length-1].b];
  const signature=s=>[s.phase,s.handNo,s.board.length,s.turn,s.scores.join(','),s.lastEvent].join(':');
  async function playFixture(round,slot,participantIds){
    const participants=participantIds.map(id=>{
      const account=players.find(p=>p.account.id===id);
      assert.ok(account,'Fixture contains unknown account');
      return account;
    });
    assert.equal(participants.length,2);
    const clients=[],states=[null,null],errors=[[],[]];
    for(let i=0;i<2;i++){
      const s=await connect();clients.push(s);
      s.on('private-state',state=>{states[i]=state});
      s.on('action-error',error=>errors[i].push(String(error)));
      const assigned=event(s,'seat-assigned');
      s.emit('join-tournament-match',{tournamentId:'rounds_e2e',round,slot,
        accountId:participants[i].account.id,accountToken:participants[i].token});
      const seat=await assigned;
      assert.equal(seat.seat,i);
    }
    let last='',moves=0,completed=null;
    const start=Date.now();
    while(Date.now()-start<205000){
      const current=states[0];
      if(!current){await delay(40);continue}
      if(current.phase==='match-over'){completed=current;break}
      if(current.phase==='choose-poser'){
        const chosen=current.poseOptions?.[0];
        if(Number.isInteger(chosen)&&last!=='pose:'+current.handNo){
          clients[chosen].emit('choose-poser',{seat:chosen});
          last='pose:'+current.handNo;
        }
        await delay(50);
        continue;
      }
      if(current.phase!=='playing'){await delay(75);continue}
      if(Date.now()<(current.dealUntil||0)+50){await delay(70);continue}
      const seat=current.turn,my=states[seat];
      if(!Number.isInteger(seat)||!my||signature(my)!==signature(current)||
        my.hand.length!==current.handCounts?.[seat]){await delay(35);continue}
      const sig=signature(current);
      if(last===sig){await delay(45);continue}
      const [left,right]=ends(current.board);
      const domino=my.hand.find(d=>!current.board.length||
        d.a===left||d.b===left||d.a===right||d.b===right);
      if(!domino){last=sig;await delay(90);continue}
      const side=domino.a===left||domino.b===left?'left':'right';
      const n=errors[seat].length;
      clients[seat].emit('play-domino',{tileId:domino.id,side});
      last=sig;moves++;
      for(let tries=0;tries<100;tries++){
        await delay(70);
        if(signature(states[0])!==sig)break;
        if(errors[seat].length!==n){
          await delay(250);
          if(signature(states[0])===sig)
            assert.fail('Rejected tournament move '+round+'/'+slot+': '+errors[seat].slice(n));
          last='';break;
        }
        if(tries===99)assert.fail('Unacknowledged move '+round+'/'+slot+' #'+moves);
      }
    }
    assert.ok(completed,'Fixture '+round+'/'+slot+' did not finish: moves='+moves+
      ' state='+JSON.stringify(states[0]&&{phase:states[0].phase,scores:states[0].scores}));
    const winningSeat=completed.scores.findIndex(score=>score===6);
    assert.ok(winningSeat>=0,'Fixture winner must finish on six');
    const winnerId=participants[winningSeat].account.id;
    clients.forEach(s=>s.disconnect());
    return winnerId;
  }

  const first=await playFixture(1,1,seeded.matches[0].playerIds);
  const afterFirst=await api('tournaments/rounds_e2e',{},false,'GET');
  assert.equal(afterFirst.status,'started');
  assert.equal(afterFirst.matches[0].winnerId,first);
  assert.equal(afterFirst.matches[1].status,'bye');
  const final=afterFirst.matches.find(m=>m.round===2&&m.slot===1);
  assert.ok(final,'Winning first-round account and bye must enter final');
  assert.equal(final.status,'pending');
  assert.deepEqual(final.playerIds,[first,players[2].account.id]);
  const champion=await playFixture(2,1,final.playerIds);
  const finished=await api('tournaments/rounds_e2e',{},false,'GET');
  assert.equal(finished.status,'completed');
  assert.equal(finished.matches.find(m=>m.round===2).winnerId,champion);
  assert.ok([first,players[2].account.id].includes(champion));
  for(const player of players)
    assert.equal((await api('me',{id:player.account.id,token:player.token})).balance,75,
      'A tournament round or bye must not charge entry twice');
});
