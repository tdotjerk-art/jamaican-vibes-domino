'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { STARTING_CREDITS, PRICES } = require('./domino-wallet');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const idOK = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
const tokenOK = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const opOK = x => typeof x === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(x);
const tourOK = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(x);

function createSqliteWallet(filename) {
  if (!filename || !path.isAbsolute(filename)) throw Error('Absolute SQLite wallet path required.');
  fs.mkdirSync(path.dirname(filename), {recursive:true,mode:0o700});
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, name TEXT COLLATE NOCASE NOT NULL UNIQUE,
      token_hash TEXT NOT NULL, balance INTEGER NOT NULL CHECK(balance BETWEEN 0 AND 1000000),
      CHECK(length(name) BETWEEN 1 AND 20)
    );
    CREATE TABLE IF NOT EXISTS operations (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      operation_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, operation_id)
    );
    CREATE TABLE IF NOT EXISTS verified_ad_events (
      event_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id)
    );
    CREATE TABLE IF NOT EXISTS public_match_entries (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      entry_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('reserved','finished','refunded')),
      PRIMARY KEY(account_id,entry_id)
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 2 AND 128),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','started','cancelled','completed'))
    );
    CREATE TABLE IF NOT EXISTS tournament_entries (
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL CHECK(status IN ('registered','withdrawn','cancelled')),
      PRIMARY KEY(tournament_id,account_id)
    );
  `);
  const accountById=db.prepare('SELECT id,name,token_hash AS tokenHash,balance FROM accounts WHERE id=?');
  const operationById=db.prepare('SELECT delta,reason FROM operations WHERE account_id=? AND operation_id=?');
  const tournamentById=db.prepare('SELECT id,capacity,status FROM tournaments WHERE id=?');

  function tx(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const value=work(); db.exec('COMMIT'); return value; }
    catch(e) { db.exec('ROLLBACK'); throw e; }
  }
  function get(id) {
    if(!idOK(id))throw Error('Invalid account ID.');
    const account=accountById.get(id);
    if(!account)throw Error('Account not found.');
    return account;
  }
  function authenticate(id,token) {
    const a=get(id);
    if(!tokenOK(token)||!crypto.timingSafeEqual(Buffer.from(a.tokenHash,'hex'),Buffer.from(hash(token),'hex')))
      throw Error('Invalid wallet credentials.');
    return {id:a.id,name:a.name,balance:a.balance};
  }
  function createAccount(name) {
    if(typeof name!=='string')throw Error('Invalid player name.');
    name=name.trim();
    if(!name||name.length>20||/tdot/i.test(name))throw Error('Invalid or reserved player name.');
    const id=crypto.randomBytes(16).toString('hex'),token=crypto.randomBytes(32).toString('hex');
    try {
      tx(()=>db.prepare('INSERT INTO accounts(id,name,token_hash,balance) VALUES(?,?,?,?)')
        .run(id,name,hash(token),STARTING_CREDITS));
    }catch(e) {
      if(/UNIQUE constraint/.test(e.message))throw Error('Signup name is already registered. Recover your original wallet.');
      throw e;
    }
    return {id,name,token,balance:STARTING_CREDITS};
  }
  function balance(id) {return get(id).balance;}
  function price(mode) {
    if(!Object.hasOwn(PRICES,mode))throw Error('Unknown game mode.');
    return PRICES[mode];
  }
  // All mutation helpers run inside one BEGIN IMMEDIATE transaction.
  function change(id,opId,delta,reason) {
    if(!opOK(opId)||!Number.isSafeInteger(delta)||!delta||typeof reason!=='string'||!reason||reason.length>100)
      throw Error('Invalid transaction.');
    const a=get(id), old=operationById.get(id,opId);
    if(old) {
      if(old.delta!==delta||old.reason!==reason)throw Error('Transaction ID conflict.');
      return {balance:a.balance,applied:false};
    }
    const next=a.balance+delta;
    if(next<0)throw Error('Insufficient credits.');
    if(next>1000000)throw Error('Wallet balance limit exceeded.');
    db.prepare('UPDATE accounts SET balance=? WHERE id=?').run(next,id);
    db.prepare('INSERT INTO operations(account_id,operation_id,delta,reason) VALUES(?,?,?,?)')
      .run(id,opId,delta,reason);
    return {balance:next,applied:true};
  }
  function enterInternal(id,mode,entryId) {
    const cost=price(mode);
    if(!cost)return {balance:get(id).balance,applied:false,cost:0};
    if(!opOK('entry:'+entryId))throw Error('Invalid entry ID.');
    if(operationById.get(id,'refund:'+entryId))throw Error('Refunded entry ID cannot be reused.');
    return {...change(id,'entry:'+entryId,-cost,mode),cost};
  }
  function refundInternal(id,mode,entryId) {
    const cost=price(mode);
    if(!cost)return {balance:get(id).balance,applied:false};
    const prior=operationById.get(id,'entry:'+entryId);
    if(!prior||prior.delta!==-cost||prior.reason!==mode)throw Error('Entry not charged.');
    return change(id,'refund:'+entryId,cost,'refund:'+mode);
  }
  function enterPublic(id,entryId) {
    return tx(()=>{
      const result=enterInternal(id,'public',entryId);
      const previous=db.prepare('SELECT status FROM public_match_entries WHERE account_id=? AND entry_id=?').get(id,entryId);
      if(previous) {
        if(previous.status==='refunded')throw Error('Refunded public entry cannot be reused.');
        return result;
      }
      if(!result.applied)throw Error('Public entry debit has no matching reservation.');
      db.prepare("INSERT INTO public_match_entries(account_id,entry_id,status) VALUES(?,?,'reserved')").run(id,entryId);
      return result;
    });
  }
  function refundPublic(id,entryId) {
    return tx(()=>{
      const previous=db.prepare('SELECT status FROM public_match_entries WHERE account_id=? AND entry_id=?').get(id,entryId);
      if(!previous)throw Error('Public entry not found.');
      if(previous.status==='finished')throw Error('Completed public entry cannot be refunded.');
      const result=refundInternal(id,'public',entryId);
      db.prepare("UPDATE public_match_entries SET status='refunded' WHERE account_id=? AND entry_id=?").run(id,entryId);
      return result;
    });
  }
  function finishPublic(id,entryId) {
    return tx(()=>{
      const previous=db.prepare('SELECT status FROM public_match_entries WHERE account_id=? AND entry_id=?').get(id,entryId);
      if(!previous)throw Error('Public entry not found.');
      if(previous.status==='refunded')throw Error('Refunded public entry cannot be completed.');
      db.prepare("UPDATE public_match_entries SET status='finished' WHERE account_id=? AND entry_id=?").run(id,entryId);
      return {balance:balance(id),applied:previous.status!=='finished'};
    });
  }
  // Rooms are currently in memory. On process restart, every paid entry that
  // was not durably marked finished must be refunded before new players join.
  function refundInterruptedPublicMatches() {
    return tx(()=>{
      const pending=db.prepare("SELECT account_id,entry_id FROM public_match_entries WHERE status='reserved'").all();
      for(const row of pending) {
        refundInternal(row.account_id,'public',row.entry_id);
        db.prepare("UPDATE public_match_entries SET status='refunded' WHERE account_id=? AND entry_id=?")
          .run(row.account_id,row.entry_id);
      }
      return pending.length;
    });
  }

  function tour(id) {
    if(!tourOK(id))throw Error('Invalid tournament ID.');
    const t=tournamentById.get(id);
    if(!t)throw Error('Tournament not found.');
    return t;
  }
  function tournamentStatus(id) {
    const t=tour(id);
    const players=db.prepare(`SELECT a.id,a.name FROM tournament_entries e
      JOIN accounts a ON a.id=e.account_id
      WHERE e.tournament_id=? AND e.status='registered' ORDER BY e.rowid`).all(id);
    return {id:t.id,status:t.status,capacity:t.capacity,players,
      placesRemaining:t.capacity-players.length};
  }
  function listTournaments() {
    return db.prepare(`SELECT t.id,t.capacity,t.status,
      (SELECT count(*) FROM tournament_entries e
       WHERE e.tournament_id=t.id AND e.status='registered') AS registered
      FROM tournaments t WHERE t.status='open' ORDER BY t.rowid DESC LIMIT 30`).all();
  }
  function createTournament(id,capacity) {
    if(!tourOK(id))throw Error('Invalid tournament ID.');
    if(!Number.isInteger(capacity)||capacity<2||capacity>128)throw Error('Invalid tournament capacity.');
    return tx(()=>{
      db.prepare('INSERT INTO tournaments(id,capacity) VALUES(?,?)').run(id,capacity);
      return tournamentStatus(id);
    });
  }
  function joinTournament(id,accountId,token) {
    return tx(()=>{
      const a=authenticate(accountId,token),t=tour(id);
      if(t.status!=='open')throw Error('Tournament registration is closed.');
      const prior=db.prepare('SELECT status FROM tournament_entries WHERE tournament_id=? AND account_id=?').get(id,a.id);
      if(prior) {
        if(prior.status==='registered')return {...tournamentStatus(id),applied:false,balance:balance(a.id)};
        throw Error('Cancelled tournament entry cannot be reused.');
      }
      const active=db.prepare("SELECT count(*) AS n FROM tournament_entries WHERE tournament_id=? AND status='registered'").get(id).n;
      if(active>=t.capacity)throw Error('Tournament is full.');
      const payment=enterInternal(a.id,'tournament','tournament-'+id);
      if(!payment.applied)throw Error('Tournament debit exists without a roster seat.');
      db.prepare("INSERT INTO tournament_entries(tournament_id,account_id,status) VALUES(?,?,'registered')").run(id,a.id);
      return {...tournamentStatus(id),applied:true,balance:payment.balance};
    });
  }
  function withdrawTournament(id,accountId,token) {
    return tx(()=>{
      const a=authenticate(accountId,token),t=tour(id);
      if(t.status!=='open')throw Error('Tournament registration is closed.');
      const prior=db.prepare('SELECT status FROM tournament_entries WHERE tournament_id=? AND account_id=?').get(id,a.id);
      if(!prior||prior.status!=='registered')throw Error('Not registered for tournament.');
      const payment=refundInternal(a.id,'tournament','tournament-'+id);
      db.prepare("UPDATE tournament_entries SET status='withdrawn' WHERE tournament_id=? AND account_id=?").run(id,a.id);
      return {...tournamentStatus(id),applied:payment.applied,balance:payment.balance};
    });
  }
  function cancelTournament(id) {
    return tx(()=>{
      const t=tour(id);
      if(t.status!=='open')throw Error('Only an open tournament can be cancelled.');
      const active=db.prepare("SELECT account_id FROM tournament_entries WHERE tournament_id=? AND status='registered'").all(id);
      for(const row of active)refundInternal(row.account_id,'tournament','tournament-'+id);
      db.prepare("UPDATE tournament_entries SET status='cancelled' WHERE tournament_id=? AND status='registered'").run(id);
      db.prepare("UPDATE tournaments SET status='cancelled' WHERE id=?").run(id);
      return tournamentStatus(id);
    });
  }
  function startTournament(id) {
    return tx(()=>{
      const t=tour(id);
      if(t.status!=='open')throw Error('Tournament registration is closed.');
      const n=db.prepare("SELECT count(*) AS n FROM tournament_entries WHERE tournament_id=? AND status='registered'").get(id).n;
      if(n<2)throw Error('Tournament needs at least two players.');
      db.prepare("UPDATE tournaments SET status='started' WHERE id=?").run(id);
      return tournamentStatus(id);
    });
  }
  function awardVerifiedReward(id,eventId) {
    if(!opOK(eventId))throw Error('Invalid reward event ID.');
    return tx(()=>{
      get(id); // Validate the credited account before recording the provider event.
      // Global uniqueness prevents one provider event rewarding multiple accounts.
      const previous=db.prepare('SELECT account_id FROM verified_ad_events WHERE event_id=?').get(eventId);
      if(previous&&previous.account_id!==id)throw Error('Reward event already assigned to another account.');
      if(!previous)db.prepare('INSERT INTO verified_ad_events(event_id,account_id) VALUES(?,?)').run(eventId,id);
      return change(id,'reward:'+eventId,30,'verified-reward');
    });
  }
  return {
    createAccount,authenticate,balance,price,
    enter:(id,mode,entryId)=>tx(()=>enterInternal(id,mode,entryId)),
    refund:(id,mode,entryId)=>tx(()=>refundInternal(id,mode,entryId)),
    awardVerifiedReward,
    awardDailyLogin:(id,day)=>{
      if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid login day.');
      return tx(()=>change(id,'daily:'+day,20,'daily-login'));
    },
    enterPublic,refundPublic,finishPublic,refundInterruptedPublicMatches,
    createTournament,joinTournament,withdrawTournament,cancelTournament,startTournament,tournamentStatus,listTournaments,
    close:()=>db.close()
  };
}
module.exports={createSqliteWallet};
