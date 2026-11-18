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
