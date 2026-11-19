'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createSqliteWallet}=require('../domino-wallet-sqlite');

function setup(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'domino-sqlite-'));
  const filename=path.join(directory,'wallet.sqlite');
  const wallet=createSqliteWallet(filename);
  t.after(()=>{wallet.close();fs.rmSync(directory,{recursive:true,force:true});});
  return {wallet,filename};
}
test('SQLite wallet persists, names are unique, refunds and daily bonuses are idempotent',t=>{
  const {wallet,filename}=setup(t);
  const a=wallet.createAccount('First');
  assert.equal(a.balance,100);
  assert.throws(()=>wallet.createAccount('fIrSt'),/already registered/i);
  assert.throws(()=>wallet.createAccount('tdotking'),/reserved/);
  assert.equal(wallet.authenticate(a.id,a.token).balance,100);
  assert.throws(()=>wallet.authenticate(a.id,'0'.repeat(64)),/credentials/);
  assert.equal(wallet.enter(a.id,'public','round1').balance,90);
  assert.equal(wallet.enter(a.id,'public','round1').applied,false);
  assert.equal(wallet.refund(a.id,'public','round1').balance,100);
  assert.equal(wallet.refund(a.id,'public','round1').applied,false);
  assert.throws(()=>wallet.enter(a.id,'public','round1'),/cannot be reused/);
  assert.equal(wallet.awardDailyLogin(a.id,'2026-11-18').balance,120);
  assert.equal(wallet.awardDailyLogin(a.id,'2026-11-18').applied,false);
  const reopened=createSqliteWallet(filename);
  assert.equal(reopened.balance(a.id),120);
  assert.equal(reopened.awardDailyLogin(a.id,'2026-11-18').applied,false);
  reopened.close();
});
test('SQLite tournament enrollment and cancellation are atomic, durable and bounded',t=>{
  const {wallet,filename}=setup(t);
  const a=wallet.createAccount('A'),b=wallet.createAccount('B'),c=wallet.createAccount('C');
  wallet.createTournament('finals',2);
  assert.equal(wallet.joinTournament('finals',a.id,a.token).balance,75);
  assert.equal(wallet.joinTournament('finals',a.id,a.token).applied,false);
  wallet.joinTournament('finals',b.id,b.token);
  assert.throws(()=>wallet.joinTournament('finals',c.id,c.token),/full/);
  assert.equal(wallet.balance(c.id),100);
  assert.equal(wallet.tournamentStatus('finals').placesRemaining,0);
  const reopened=createSqliteWallet(filename);
  assert.equal(reopened.tournamentStatus('finals').players.length,2);
  assert.equal(reopened.cancelTournament('finals').status,'cancelled');
  assert.equal(reopened.balance(a.id),100);
  assert.equal(reopened.balance(b.id),100);
  assert.throws(()=>reopened.cancelTournament('finals'),/Only an open/);
  assert.throws(()=>reopened.joinTournament('finals',c.id,c.token),/closed/);
  reopened.close();
});
test('SQLite tournament withdrawals retire registration, start closes entries',t=>{
  const {wallet}=setup(t);
  const a=wallet.createAccount('A'),b=wallet.createAccount('B');
  wallet.createTournament('cup',3);
  wallet.joinTournament('cup',a.id,a.token);
  assert.equal(wallet.withdrawTournament('cup',a.id,a.token).balance,100);
  assert.throws(()=>wallet.joinTournament('cup',a.id,a.token),/cannot be reused/);
  wallet.joinTournament('cup',b.id,b.token);
  assert.throws(()=>wallet.startTournament('cup'),/at least two/);
  const c=wallet.createAccount('C');
  wallet.joinTournament('cup',c.id,c.token);
  assert.equal(wallet.startTournament('cup').status,'started');
  assert.throws(()=>wallet.withdrawTournament('cup',b.id,b.token),/closed/);
  assert.equal(wallet.balance(b.id),75);
});
test('SQLite verified ad IDs cannot pay multiple accounts, and malformed accounts never change balances',t=>{
  const {wallet}=setup(t);
  const a=wallet.createAccount('A'),b=wallet.createAccount('B');
  assert.equal(wallet.awardVerifiedReward(a.id,'provider-event-1').balance,130);
  assert.equal(wallet.awardVerifiedReward(a.id,'provider-event-1').applied,false);
  assert.throws(()=>wallet.awardVerifiedReward(b.id,'provider-event-1'),/another account/);
  assert.equal(wallet.balance(b.id),100);
  assert.throws(()=>wallet.awardVerifiedReward('0'.repeat(32),'provider-event-2'),/Account not found/);
  assert.equal(wallet.awardVerifiedReward(b.id,'provider-event-2').balance,130);
});

test('interrupted public games refund on restart without refunding finished matches',t=>{
  const {wallet,filename}=setup(t);
  const a=wallet.createAccount('InterruptA');
  const b=wallet.createAccount('FinishB');
  assert.equal(wallet.enterPublic(a.id,'join-1').balance,90);
  assert.equal(wallet.enterPublic(a.id,'join-1').applied,false);
  wallet.enterPublic(b.id,'join-2');
  assert.equal(wallet.finishPublic(b.id,'join-2').applied,true);
  assert.equal(wallet.finishPublic(b.id,'join-2').applied,false);
  const reopened=createSqliteWallet(filename);
  assert.equal(reopened.refundInterruptedPublicMatches(),1);
  assert.equal(reopened.balance(a.id),100);
  assert.equal(reopened.balance(b.id),90);
  assert.equal(reopened.refundInterruptedPublicMatches(),0);
  assert.throws(()=>reopened.enterPublic(a.id,'join-1'),/cannot be reused/);
  assert.throws(()=>reopened.refundPublic(b.id,'join-2'),/cannot be refunded/);
  reopened.close();
});

test('a pregame seat abandonment is refunded and cannot be settled or replayed',t=>{
  const {wallet}=setup(t);
  const a=wallet.createAccount('SeatExit');
  assert.equal(wallet.enterPublic(a.id,'seat-1').balance,90);
  assert.equal(wallet.refundPublic(a.id,'seat-1').balance,100);
  assert.equal(wallet.refundPublic(a.id,'seat-1').applied,false);
  assert.throws(()=>wallet.finishPublic(a.id,'seat-1'),/cannot be completed/);
  assert.throws(()=>wallet.enterPublic(a.id,'seat-1'),/cannot be reused/);
});

test('a public rematch charges all seats or none, with no partial debit',t=>{
  const {wallet}=setup(t);
  const a=wallet.createAccount('RematchA');
  const b=wallet.createAccount('RematchB');
  const oldA=wallet.enterPublic(a.id,'first-a');
  const oldB=wallet.enterPublic(b.id,'first-b');
  assert.equal(oldA.balance,90);
  assert.equal(oldB.balance,90);
  wallet.finishPublic(a.id,'first-a');
  wallet.finishPublic(b.id,'first-b');
  const charges=wallet.reservePublicRematch([
    {accountId:a.id,entryId:'second-a'},
    {accountId:b.id,entryId:'second-b'}
  ]);
  assert.deepEqual(charges.map(x=>x.balance),[80,80]);
  assert.throws(()=>wallet.reservePublicRematch([
    {accountId:a.id,entryId:'second-a'},
    {accountId:b.id,entryId:'third-b'}
  ]),/Duplicate public rematch debit/);
  assert.equal(wallet.balance(a.id),80);
  assert.equal(wallet.balance(b.id),80);
  assert.equal(wallet.refundPublic(a.id,'second-a').balance,90);
  assert.equal(wallet.refundPublic(b.id,'second-b').balance,90);
});

test('insufficient balance on one rematch seat rolls back all charges',t=>{
  const {wallet}=setup(t);
  const a=wallet.createAccount('RichSeat');
  const b=wallet.createAccount('EmptySeat');
  for(let i=0;i<10;i++)wallet.enter(b.id,'public','spent-'+i);
  assert.equal(wallet.balance(b.id),0);
  assert.throws(()=>wallet.reservePublicRematch([
    {accountId:a.id,entryId:'new-a'},
    {accountId:b.id,entryId:'new-b'}
  ]),/Insufficient credits/);
  assert.equal(wallet.balance(a.id),100);
  assert.equal(wallet.balance(b.id),0);
  assert.equal(wallet.enterPublic(a.id,'new-a').balance,90);
});

test('tournament bracket advances through recorded results and survives database reopening',t=>{
  const {wallet,filename}=setup(t);
  const players=['One','Two','Three','Four'].map(name=>wallet.createAccount(name));
  wallet.createTournament('bracket4',4);
  for(const p of players)wallet.joinTournament('bracket4',p.id,p.token);
  const started=wallet.startTournament('bracket4');
  assert.equal(started.matches.length,2);
  assert.equal(started.matches[0].round,1);
  assert.deepEqual(started.matches.map(m=>m.status),['pending','pending']);
  assert.throws(()=>wallet.recordTournamentWinner('bracket4',1,1,players[3].id),/not seated/);
  assert.equal(wallet.recordTournamentWinner('bracket4',1,1,players[0].id).applied,true);
  assert.equal(wallet.recordTournamentWinner('bracket4',1,1,players[0].id).applied,false);
  assert.throws(()=>wallet.recordTournamentWinner('bracket4',1,1,players[1].id),/different winner/);
  const reopened=createSqliteWallet(filename);
  assert.equal(reopened.tournamentStatus('bracket4').matches.length,2);
  reopened.recordTournamentWinner('bracket4',1,2,players[2].id);
  const round2=reopened.tournamentStatus('bracket4');
  assert.equal(round2.matches.length,3);
  assert.equal(round2.matches[2].round,2);
  assert.equal(round2.matches[2].playerA,players[0].id);
  assert.equal(round2.matches[2].playerB,players[2].id);
  assert.throws(()=>reopened.recordTournamentWinner('bracket4',2,1,players[1].id),/not seated/);
  assert.equal(reopened.recordTournamentWinner('bracket4',2,1,players[2].id).status,'completed');
  assert.equal(reopened.tournamentStatus('bracket4').matches[2].winnerId,players[2].id);
  assert.throws(()=>reopened.recordTournamentWinner('bracket4',2,1,players[0].id),/not accepting results/);
  reopened.close();
});

test('odd sized bracket creates deterministic bye and advances remaining competitors',t=>{
  const {wallet}=setup(t);
  const players=['ByeA','ByeB','ByeC'].map(name=>wallet.createAccount(name));
  wallet.createTournament('odd3',4);
  for(const p of players)wallet.joinTournament('odd3',p.id,p.token);
  const started=wallet.startTournament('odd3');
  assert.equal(started.matches.length,2);
  assert.equal(started.matches[1].status,'bye');
  assert.equal(started.matches[1].winnerId,players[2].id);
  assert.throws(()=>wallet.recordTournamentWinner('odd3',1,2,players[2].id),/Bye results cannot/);
  const advanced=wallet.recordTournamentWinner('odd3',1,1,players[0].id);
  assert.equal(advanced.matches.length,3);
  assert.equal(advanced.matches[2].round,2);
  assert.equal(advanced.matches[2].playerB,players[2].id);
});

test('three-player Cut Throat tournament advances one winner per table and byes',t=>{
  const {wallet}=setup(t);
  const players=Array.from({length:7},(_,i)=>wallet.createAccount('Three'+i));
  wallet.createTournament('three_seats',9,3);
  players.forEach(p=>wallet.joinTournament('three_seats',p.id,p.token));
  let bracket=wallet.startTournament('three_seats');
  assert.equal(bracket.playerCount,3);
  assert.deepEqual(bracket.matches.map(m=>m.playerIds.length),[3,3,1]);
  assert.equal(bracket.matches[2].status,'bye');
  assert.equal(bracket.matches[2].winnerId,players[6].id);
  assert.throws(()=>wallet.recordTournamentWinner('three_seats',1,1,players[4].id),/not seated/);
  wallet.recordTournamentWinner('three_seats',1,1,players[2].id);
  bracket=wallet.recordTournamentWinner('three_seats',1,2,players[4].id);
  assert.equal(bracket.matches.length,4);
  assert.deepEqual(bracket.matches[3].playerIds,[players[2].id,players[4].id,players[6].id]);
  assert.equal(wallet.myTournamentMatches(players[6].id,players[6].token)[0].matches.length,2);
  bracket=wallet.recordTournamentWinner('three_seats',2,1,players[6].id);
  assert.equal(bracket.status,'completed');
  assert.equal(bracket.matches[3].winnerId,players[6].id);
});

test('four-player Cut Throat has four-player fixtures and a two-player final',t=>{
  const {wallet}=setup(t);
  const players=Array.from({length:5},(_,i)=>wallet.createAccount('Four'+i));
  wallet.createTournament('four_seats',8,4);
  players.forEach(p=>wallet.joinTournament('four_seats',p.id,p.token));
  let bracket=wallet.startTournament('four_seats');
  assert.equal(bracket.playerCount,4);
  assert.deepEqual(bracket.matches.map(m=>m.playerIds.length),[4,1]);
  bracket=wallet.recordTournamentWinner('four_seats',1,1,players[3].id);
  assert.equal(bracket.matches[2].status,'pending');
  assert.deepEqual(bracket.matches[2].playerIds,[players[3].id,players[4].id]);
  assert.throws(()=>wallet.recordTournamentWinner('four_seats',2,1,players[0].id),/not seated/);
  assert.equal(wallet.recordTournamentWinner('four_seats',2,1,players[4].id).status,'completed');
  assert.throws(()=>wallet.createTournament('invalid_format',4,5),/table size/);
});

test('recovery code rotation revokes old credentials and survives database restart',t=>{
  const {wallet,filename}=setup(t);
  const owner=wallet.createAccount('RecoveryOwner');
  const other=wallet.createAccount('RecoveryOther');
  wallet.enter(owner.id,'public','before-rotation');
  const balance=wallet.balance(owner.id);
  assert.throws(()=>wallet.rotateRecoveryToken(owner.id,'0'.repeat(64)),/credentials/i);
  assert.throws(()=>wallet.rotateRecoveryToken(other.id,owner.token),/credentials/i);
  const rotated=wallet.rotateRecoveryToken(owner.id,owner.token);
  assert.equal(rotated.id,owner.id);
  assert.equal(rotated.name,owner.name);
  assert.equal(rotated.balance,balance);
  assert.match(rotated.token,/^[a-f0-9]{64}$/);
  assert.notEqual(rotated.token,owner.token);
  assert.throws(()=>wallet.authenticate(owner.id,owner.token),/credentials/i);
  assert.throws(()=>wallet.rotateRecoveryToken(owner.id,owner.token),/credentials/i);
  assert.equal(wallet.authenticate(owner.id,rotated.token).balance,balance);
  assert.equal(wallet.authenticate(other.id,other.token).balance,100);
  const reopened=createSqliteWallet(filename);
  assert.throws(()=>reopened.authenticate(owner.id,owner.token),/credentials/i);
  assert.equal(reopened.authenticate(owner.id,rotated.token).balance,balance);
  const twice=reopened.rotateRecoveryToken(owner.id,rotated.token);
  assert.throws(()=>wallet.authenticate(owner.id,rotated.token),/credentials/i);
  assert.equal(reopened.authenticate(owner.id,twice.token).balance,balance);
  reopened.close();
});

test('signup quotas survive restart and failed duplicate names do not consume capacity',t=>{
  const {wallet,filename}=setup(t);
  const source='203.0.113.24';
  for(let i=0;i<4;i++)wallet.createAccount('Bounded'+i,source);
  assert.throws(()=>wallet.createAccount('bounded0',source),/already registered/i);
  for(let i=4;i<8;i++)wallet.createAccount('Bounded'+i,source);
  assert.throws(()=>wallet.createAccount('Ninth',source),/Too many wallet signups/);
  // A second source is independent and the quota is stored on disk.
  assert.equal(wallet.createAccount('OtherSource','198.51.100.7').balance,100);
  const reopened=createSqliteWallet(filename);
  assert.throws(()=>reopened.createAccount('RestartNinth',source),/Too many wallet signups/);
  assert.equal(reopened.createAccount('OtherNew','198.51.100.7').balance,100);
  reopened.close();
});

test('trusted rewarded-ad intent settles only once and stays durable across restart',t=>{
  const {wallet,filename}=setup(t);
  const a=wallet.createAccount('RewardA'), b=wallet.createAccount('RewardB');
  const now=Date.now();
  assert.throws(()=>wallet.createRewardIntent(a.id,b.token,now),/credentials/i);
  const intent=wallet.createRewardIntent(a.id,a.token,now);
  assert.match(intent.nonce,/^[a-f0-9]{48}$/);
  assert.equal(wallet.balance(a.id),100,'requesting an ad must award zero credits');
  assert.throws(()=>wallet.settleVerifiedRewardIntent('f'.repeat(48),'provider-1',now),/Unknown/);
  const paid=wallet.settleVerifiedRewardIntent(intent.nonce,'provider-1',now+1000);
  assert.equal(paid.balance,130);
  assert.equal(paid.credits,30);
  assert.equal(wallet.settleVerifiedRewardIntent(intent.nonce,'provider-1',now+1500).applied,false);
  assert.throws(()=>wallet.settleVerifiedRewardIntent(intent.nonce,'provider-2',now+2000),/different event/);
  const other=wallet.createRewardIntent(b.id,b.token,now);
  assert.throws(()=>wallet.settleVerifiedRewardIntent(other.nonce,'provider-1',now+1000),/already used/);
  assert.equal(wallet.balance(b.id),100);
  const reopened=createSqliteWallet(filename);
  assert.equal(reopened.settleVerifiedRewardIntent(intent.nonce,'provider-1',now+3000).applied,false);
  assert.equal(reopened.balance(a.id),130);
  reopened.close();
});
test('reward requests expire and daily verified rewards are capped transactionally',t=>{
  const {wallet}=setup(t);
  const a=wallet.createAccount('RewardLimit');
  const now=Date.now();
  const expired=wallet.createRewardIntent(a.id,a.token,now);
  assert.throws(()=>wallet.settleVerifiedRewardIntent(expired.nonce,'expired-event',now+15*60*1000+1),/expired/);
  assert.equal(wallet.balance(a.id),100);
  for(let i=0;i<3;i++){
    const intent=wallet.createRewardIntent(a.id,a.token,now+1000+i*1000);
    assert.equal(wallet.settleVerifiedRewardIntent(intent.nonce,'reward-'+i,now+1000+i*1000).applied,true);
  }
  assert.equal(wallet.balance(a.id),190);
  const extra=wallet.createRewardIntent(a.id,a.token,now+6000);
  assert.throws(()=>wallet.settleVerifiedRewardIntent(extra.nonce,'reward-four',now+6000),/limit reached/);
  assert.equal(wallet.balance(a.id),190);
  assert.throws(()=>wallet.settleVerifiedRewardIntent(extra.nonce,'reward-four',now-1),/expired/);
  assert.throws(()=>wallet.createRewardIntent(a.id,'0'.repeat(64)),/credentials/);
  wallet.createRewardIntent(a.id,a.token,now+7000);
  assert.throws(()=>wallet.createRewardIntent(a.id,a.token,now+8000),/Too many reward requests/);
});
