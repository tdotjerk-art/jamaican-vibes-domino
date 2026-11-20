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

function createSqliteWallet(filename, options={}) {
  const emailRequired=options.verifiedEmailRequired===true;
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
    CREATE TABLE IF NOT EXISTS reward_intents (
      nonce TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled')),
      event_id TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS reward_intents_account_created
      ON reward_intents(account_id,created_at);
    CREATE TABLE IF NOT EXISTS public_match_entries (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      entry_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('reserved','finished','refunded')),
      PRIMARY KEY(account_id,entry_id)
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 2 AND 128),
      player_count INTEGER NOT NULL DEFAULT 2 CHECK(player_count IN (2,3,4)),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','started','cancelled','completed'))
    );
    CREATE TABLE IF NOT EXISTS tournament_entries (
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL CHECK(status IN ('registered','withdrawn','cancelled')),
      PRIMARY KEY(tournament_id,account_id)
    );
    CREATE TABLE IF NOT EXISTS tournament_matches (
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      round INTEGER NOT NULL CHECK(round >= 1),
      slot INTEGER NOT NULL CHECK(slot >= 1),
      player_a TEXT NOT NULL REFERENCES accounts(id),
      player_b TEXT REFERENCES accounts(id),
      winner_id TEXT REFERENCES accounts(id),
      status TEXT NOT NULL CHECK(status IN ('pending','completed','bye')),
      PRIMARY KEY(tournament_id,round,slot),
      CHECK(player_b IS NULL OR player_a <> player_b)
    );
    -- Each attempt represents a new room for an unfinished bracket fixture.
    -- On restart, old in-memory boards are deliberately abandoned and a new
    -- attempt starts at a fresh deal. No extra tournament entry is charged.
    CREATE TABLE IF NOT EXISTS tournament_match_seats (
      tournament_id TEXT NOT NULL, round INTEGER NOT NULL, slot INTEGER NOT NULL,
      seat INTEGER NOT NULL CHECK(seat BETWEEN 0 AND 3),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      PRIMARY KEY(tournament_id,round,slot,seat),
      UNIQUE(tournament_id,round,slot,account_id),
      FOREIGN KEY(tournament_id,round,slot) REFERENCES tournament_matches(tournament_id,round,slot)
    );
    CREATE TABLE IF NOT EXISTS tournament_fixture_attempts (
      tournament_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
      PRIMARY KEY(tournament_id,round,slot),
      FOREIGN KEY(tournament_id,round,slot)
        REFERENCES tournament_matches(tournament_id,round,slot)
    );
  `);
  // Persist a database-specific HMAC secret. Never store visitors' raw IPs.
  // Both the secret and daily counters survive a process restart.
  db.exec(`
    CREATE TABLE IF NOT EXISTS signup_guard_config (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signup_guard_counts (
      source_hash TEXT NOT NULL, utc_day TEXT NOT NULL,
      count INTEGER NOT NULL CHECK(count BETWEEN 0 AND 8),
      PRIMARY KEY(source_hash,utc_day)
    );
    -- A separate system-wide cap slows IP/VPN rotation account farming.
    -- The global count includes only successful new wallet registrations.
    CREATE TABLE IF NOT EXISTS signup_global_counts (
      utc_day TEXT PRIMARY KEY,
      count INTEGER NOT NULL CHECK(count BETWEEN 0 AND 100)
    );
  `);
  db.prepare("INSERT OR IGNORE INTO signup_guard_config(key,value) VALUES('salt',?)")
    .run(crypto.randomBytes(32).toString('hex'));
  const signupSalt=db.prepare("SELECT value FROM signup_guard_config WHERE key='salt'").get().value;
  if(!db.prepare('PRAGMA table_info(tournaments)').all().some(c=>c.name==='player_count'))
    db.exec('ALTER TABLE tournaments ADD COLUMN player_count INTEGER NOT NULL DEFAULT 2 CHECK(player_count IN (2,3,4))');
  // Opt-in email ownership: legacy development fixtures remain unchanged until
  // the verified-registration gate is explicitly enabled.
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_email_identity (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      verified_at INTEGER,
      verify_hash TEXT,
      verify_expires INTEGER,
      recovery_hash TEXT,
      recovery_expires INTEGER,
      email_sent_at INTEGER,
      recovery_sent_at INTEGER
    );
  `);
  const normalizeEmail=value=>{
    if(typeof value!=='string')throw Error('Valid email address required.');
    const email=value.trim().toLowerCase();
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw Error('Valid email address required.');
    return email;
  };
  const makeEmailCode=()=>crypto.randomBytes(24).toString('hex');
  const emailIdentity=id=>db.prepare('SELECT * FROM wallet_email_identity WHERE account_id=?').get(id);
  const emailVerified=id=>!!emailIdentity(id)?.verified_at;
  // No account-lookup, tournament join, daily credits, or paid socket access
  // is granted while a required email is unverified.
  const accountById=db.prepare('SELECT id,name,token_hash AS tokenHash,balance FROM accounts WHERE id=?');
  const operationById=db.prepare('SELECT delta,reason FROM operations WHERE account_id=? AND operation_id=?');
  const tournamentById=db.prepare('SELECT id,capacity,status,player_count AS playerCount FROM tournaments WHERE id=?');

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
    if(emailRequired&&!emailVerified(a.id))throw Error('Email verification required.');
    return {id:a.id,name:a.name,balance:a.balance};
  }
  // Compare a session's hashed credential with the current durable wallet credential.
  // The caller must have authenticated before establishing the session.
  function credentialFingerprintCurrent(id,fingerprint) {
    if(!idOK(id)||typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))return false;
    const account=accountById.get(id);
    return !!account&&(!emailRequired||emailVerified(id))&&crypto.timingSafeEqual(Buffer.from(account.tokenHash,'hex'),Buffer.from(fingerprint,'hex'));
  }
  // Recovery-code rotation is an authenticated, durable revocation operation.
  // Do not log or store the new cleartext code. Existing account balances and
  // tournament entries retain their account ID after a rotation.
  function rotateRecoveryToken(id,token) {
    return tx(()=>{
      const account=authenticate(id,token);
      const next=crypto.randomBytes(32).toString('hex');
      db.prepare('UPDATE accounts SET token_hash=? WHERE id=?').run(hash(next),id);
      return {id:account.id,name:account.name,balance:account.balance,token:next};
    });
  }
  function createAccount(name,source,email) {
    if(typeof name!=='string')throw Error('Invalid player name.');
    name=name.trim();
    if(!name||name.length>20||/tdot/i.test(name))throw Error('Invalid or reserved player name.');
    // The API always supplies a server-derived peer address. Optional source
    // keeps direct, offline wallet fixture creation backward compatible.
    if(source!==undefined&&(typeof source!=='string'||!source||source.length>128))
      throw Error('Invalid registration source.');
    if(emailRequired)email=normalizeEmail(email);
    const id=crypto.randomBytes(16).toString('hex'),token=crypto.randomBytes(32).toString('hex');
    const emailCode=emailRequired?makeEmailCode():null;
    try {
      tx(()=>{
        if(source!==undefined){
          const sourceHash=crypto.createHmac('sha256',Buffer.from(signupSalt,'hex')).update(source).digest('hex');
          const utcDay=new Date().toISOString().slice(0,10);
          const prior=db.prepare('SELECT count FROM signup_guard_counts WHERE source_hash=? AND utc_day=?')
            .get(sourceHash,utcDay);
          if((prior?.count||0)>=8)throw Error('Too many wallet signups from this connection today. Try again later.');
          const global=db.prepare('SELECT count FROM signup_global_counts WHERE utc_day=?').get(utcDay);
          if((global?.count||0)>=100)throw Error('New wallet registration is temporarily at capacity. Try again tomorrow.');
          db.prepare(`INSERT INTO signup_guard_counts(source_hash,utc_day,count) VALUES(?,?,1)
            ON CONFLICT(source_hash,utc_day) DO UPDATE SET count=count+1`)
            .run(sourceHash,utcDay);
          db.prepare(`INSERT INTO signup_global_counts(utc_day,count) VALUES(?,1)
            ON CONFLICT(utc_day) DO UPDATE SET count=count+1`).run(utcDay);
          // Remove expired counters without retaining long-term network history.
          const expiry=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
          db.prepare('DELETE FROM signup_guard_counts WHERE utc_day < ?').run(expiry);
          db.prepare('DELETE FROM signup_global_counts WHERE utc_day < ?').run(expiry);
        }
        db.prepare('INSERT INTO accounts(id,name,token_hash,balance) VALUES(?,?,?,?)')
          .run(id,name,hash(token),STARTING_CREDITS);
        if(emailRequired) db.prepare(`INSERT INTO wallet_email_identity
          (account_id,email,verify_hash,verify_expires,email_sent_at)
          VALUES(?,?,?,?,?)`).run(id,email,hash(emailCode),Date.now()+15*60000,Date.now());
      });
    }catch(e) {
      if(/UNIQUE constraint/.test(e.message))throw Error('Signup name is already registered. Recover your original wallet.');
      throw e;
    }
    return {id,name,token,balance:STARTING_CREDITS,...(emailRequired?{email,emailCode}:{})};
  }
  function resendRegistrationEmail(id,email,now=Date.now()){
    if(!idOK(id)||!Number.isSafeInteger(now))throw Error('Invalid verification request.');
    email=normalizeEmail(email);
    return tx(()=>{
      const identity=emailIdentity(id);
      if(!identity||identity.email!==email||identity.verified_at)
        throw Error('Unverified account not found.');
      if(identity.email_sent_at&&now-identity.email_sent_at<15*60000)
        throw Error('Please wait before requesting another verification email.');
      const next=makeEmailCode();
      db.prepare(`UPDATE wallet_email_identity
        SET verify_hash=?,verify_expires=?,email_sent_at=? WHERE account_id=?`)
        .run(hash(next),now+15*60000,now,id);
      return {email,code:next};
    });
  }
  function verifyRegistrationEmail(id,code,now=Date.now()){
    if(!idOK(id)||typeof code!=='string'||!/^[a-f0-9]{48}$/.test(code)||!Number.isSafeInteger(now))throw Error('Invalid verification code.');
    return tx(()=>{
      const identity=emailIdentity(id);
      if(!identity||identity.verified_at||!identity.verify_hash||now>identity.verify_expires||
         !crypto.timingSafeEqual(Buffer.from(identity.verify_hash,'hex'),Buffer.from(hash(code),'hex')))
        throw Error('Invalid or expired verification code.');
      const a=get(id),newToken=crypto.randomBytes(32).toString('hex');
      db.prepare('UPDATE accounts SET token_hash=? WHERE id=?').run(hash(newToken),id);
      db.prepare(`UPDATE wallet_email_identity SET verified_at=?,verify_hash=NULL,verify_expires=NULL
        WHERE account_id=?`).run(now,id);
      return {id:a.id,name:a.name,balance:a.balance,token:newToken};
    });
  }
  function requestEmailRecovery(email,now=Date.now()){
    email=normalizeEmail(email);
    if(!Number.isSafeInteger(now))throw Error('Invalid recovery timestamp.');
    return tx(()=>{
      const identity=db.prepare(`SELECT account_id AS accountId,recovery_sent_at AS sent
        FROM wallet_email_identity WHERE email=? AND verified_at IS NOT NULL`).get(email);
      if(!identity)return null; // Caller returns same generic response.
      if(identity.sent&&now-identity.sent<15*60000)return null;
      const code=makeEmailCode();
      db.prepare(`UPDATE wallet_email_identity
        SET recovery_hash=?,recovery_expires=?,recovery_sent_at=?
        WHERE account_id=?`).run(hash(code),now+15*60000,now,identity.accountId);
      return {email,code};
    });
  }
  function completeEmailRecovery(email,code,now=Date.now()){
    email=normalizeEmail(email);
    if(typeof code!=='string'||!/^[a-f0-9]{48}$/.test(code)||!Number.isSafeInteger(now))throw Error('Invalid recovery code.');
    return tx(()=>{
      const identity=db.prepare(`SELECT account_id AS accountId,recovery_hash AS codeHash,
        recovery_expires AS expires FROM wallet_email_identity
        WHERE email=? AND verified_at IS NOT NULL`).get(email);
      if(!identity||!identity.codeHash||now>identity.expires||
         !crypto.timingSafeEqual(Buffer.from(identity.codeHash,'hex'),Buffer.from(hash(code),'hex')))
        throw Error('Invalid or expired recovery code.');
      const a=get(identity.accountId),newToken=crypto.randomBytes(32).toString('hex');
      db.prepare('UPDATE accounts SET token_hash=? WHERE id=?').run(hash(newToken),a.id);
      db.prepare(`UPDATE wallet_email_identity SET recovery_hash=NULL,recovery_expires=NULL
        WHERE account_id=?`).run(a.id);
      return {id:a.id,name:a.name,balance:a.balance,token:newToken};
    });
  }
  function recoverableEmail(id){return emailIdentity(id)?.email||null;}
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
  function reservePublicRematch(entries) {
    if(!Array.isArray(entries)||entries.length<2||entries.length>4)
      throw Error('Invalid public rematch entries.');
    if(new Set(entries.map(e=>e?.accountId)).size!==entries.length)
      throw Error('Duplicate account in public rematch.');
    return tx(()=>{
      const result=[];
      for(const e of entries) {
        const charge=enterInternal(e.accountId,'public',e.entryId);
        if(!charge.applied)throw Error('Duplicate public rematch debit.');
        db.prepare("INSERT INTO public_match_entries(account_id,entry_id,status) VALUES(?,?,'reserved')")
          .run(e.accountId,e.entryId);
        result.push({...charge,accountId:e.accountId,entryId:e.entryId});
      }
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
  function tournamentMatches(id,accountId=null){
    const matches=db.prepare(`SELECT m.round,m.slot,m.player_a AS playerA,m.player_b AS playerB,
      m.winner_id AS winnerId,m.status,coalesce(a.attempts,0) AS attempts
      FROM tournament_matches m LEFT JOIN tournament_fixture_attempts a
        ON a.tournament_id=m.tournament_id AND a.round=m.round AND a.slot=m.slot
      WHERE m.tournament_id=? ORDER BY m.round,m.slot`).all(id);
    const seats=db.prepare(`SELECT round,slot,seat,account_id AS accountId
      FROM tournament_match_seats WHERE tournament_id=? ORDER BY round,slot,seat`).all(id);
    return matches.map(m=>{
      const playerIds=seats.filter(p=>p.round===m.round&&p.slot===m.slot).map(p=>p.accountId);
      if(!playerIds.length)playerIds.push(...[m.playerA,m.playerB].filter(Boolean));
      return {...m,playerIds};
    }).filter(m=>accountId===null||m.playerIds.includes(accountId));
  }
  function tournamentStatus(id) {
    const t=tour(id);
    const players=db.prepare(`SELECT a.id,a.name FROM tournament_entries e
      JOIN accounts a ON a.id=e.account_id
      WHERE e.tournament_id=? AND e.status='registered' ORDER BY e.rowid`).all(id);
    const matches=tournamentMatches(id);
    return {id:t.id,status:t.status,capacity:t.capacity,playerCount:t.playerCount,players,matches,
      placesRemaining:t.capacity-players.length};
  }
  function myTournamentMatches(accountId,token) {
    const account=authenticate(accountId,token);
    const entries=db.prepare(`SELECT t.id,t.status,e.status AS registrationStatus
      FROM tournament_entries e JOIN tournaments t ON t.id=e.tournament_id
      WHERE e.account_id=? ORDER BY t.rowid DESC LIMIT 30`).all(account.id);
    return entries.map(entry=>{
      const matches=tournamentMatches(entry.id,account.id);
      return {...entry,playerCount:tour(entry.id).playerCount,matches};
    });
  }
  function listTournaments() {
    return db.prepare(`SELECT t.id,t.capacity,t.status,t.player_count AS playerCount,
      (SELECT count(*) FROM tournament_entries e
       WHERE e.tournament_id=t.id AND e.status='registered') AS registered
      FROM tournaments t WHERE t.status='open' ORDER BY t.rowid DESC LIMIT 30`).all();
  }
  function createTournament(id,capacity,playerCount=2) {
    if(!tourOK(id))throw Error('Invalid tournament ID.');
    if(!Number.isInteger(capacity)||capacity<2||capacity>128)throw Error('Invalid tournament capacity.');
    if(![2,3,4].includes(playerCount))throw Error('Tournament table size must be 2, 3 or 4.');
    return tx(()=>{
      db.prepare('INSERT INTO tournaments(id,capacity,player_count) VALUES(?,?,?)').run(id,capacity,playerCount);
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
  function openTournamentFixtureAttempt(id,round,slot) {
    return tx(()=>{
      const t=tour(id);
      if(t.status!=='started')throw Error('Tournament is not in progress.');
      if(!Number.isInteger(round)||round<1||!Number.isInteger(slot)||slot<1)
        throw Error('Invalid tournament fixture.');
      const match=db.prepare(`SELECT status,player_b AS playerB FROM tournament_matches
        WHERE tournament_id=? AND round=? AND slot=?`).get(id,round,slot);
      if(!match||match.status!=='pending'||!match.playerB)
        throw Error('Tournament match is not awaiting players.');
      db.prepare(`INSERT INTO tournament_fixture_attempts(tournament_id,round,slot,attempts)
        VALUES(?,?,?,1) ON CONFLICT(tournament_id,round,slot)
        DO UPDATE SET attempts=attempts+1`).run(id,round,slot);
      const {attempts}=db.prepare(`SELECT attempts FROM tournament_fixture_attempts
        WHERE tournament_id=? AND round=? AND slot=?`).get(id,round,slot);
      return {attempt:attempts,replay:attempts>1};
    });
  }
  function createRound(id,round,ids) {
    if(ids.length<2)throw Error('Cannot create a round with fewer than two competitors.');
    const count=tour(id).playerCount;
    const insert=db.prepare(`INSERT INTO tournament_matches
      (tournament_id,round,slot,player_a,player_b,winner_id,status) VALUES(?,?,?,?,?,?,?)`);
    const seatInsert=db.prepare(`INSERT INTO tournament_match_seats
      (tournament_id,round,slot,seat,account_id) VALUES(?,?,?,?,?)`);
    const full=Math.floor(ids.length/count),groups=[];
    if(full){
      for(let i=0;i<full;i++)groups.push(ids.slice(i*count,(i+1)*count));
      for(const id of ids.slice(full*count))groups.push([id]);
    }else groups.push(ids); // Final or small tournament: two or more can play.
    groups.forEach((players,i)=>{
      const slot=i+1,bye=players.length===1;
      insert.run(id,round,slot,players[0],players[1]||null,bye?players[0]:null,bye?'bye':'pending');
      players.forEach((account,seat)=>seatInsert.run(id,round,slot,seat,account));
    });
  }
  function startTournament(id) {
    return tx(()=>{
      const t=tour(id);
      if(t.status!=='open')throw Error('Tournament registration is closed.');
      const players=db.prepare(`SELECT account_id FROM tournament_entries
        WHERE tournament_id=? AND status='registered' ORDER BY rowid`).all(id).map(x=>x.account_id);
      if(players.length<2)throw Error('Tournament needs at least two players.');
      createRound(id,1,players);
      db.prepare("UPDATE tournaments SET status='started' WHERE id=?").run(id);
      return tournamentStatus(id);
    });
  }
  // This is an ADMIN-ONLY adjudication primitive until the real Domino match
  // server can cryptographically bind a completed game to its bracket fixture.
  // Never expose as an unauthenticated or player-submitted result endpoint.
  function recordTournamentWinner(id,round,slot,winnerId) {
    return tx(()=>{
      const t=tour(id);
      if(t.status!=='started')throw Error('Tournament is not accepting results.');
      if(!Number.isInteger(round)||round<1||!Number.isInteger(slot)||slot<1)
        throw Error('Invalid tournament match number.');
      const match=db.prepare(`SELECT player_a AS a,player_b AS b,winner_id AS winner,
        status FROM tournament_matches WHERE tournament_id=? AND round=? AND slot=?`)
        .get(id,round,slot);
      if(!match)throw Error('Tournament match not found.');
      if(match.status==='bye')throw Error('Bye results cannot be changed.');
      const assigned=tournamentMatches(id).find(m=>m.round===round&&m.slot===slot)?.playerIds||[];
      if(!assigned.includes(winnerId))throw Error('Winner is not seated in this match.');
      if(match.status==='completed') {
        if(match.winner!==winnerId)throw Error('Tournament match already has a different winner.');
        return {...tournamentStatus(id),applied:false};
      }
      db.prepare(`UPDATE tournament_matches SET status='completed',winner_id=?
        WHERE tournament_id=? AND round=? AND slot=?`).run(winnerId,id,round,slot);
      const fixtures=db.prepare(`SELECT winner_id AS winner, status FROM tournament_matches
        WHERE tournament_id=? AND round=? ORDER BY slot`).all(id,round);
      if(fixtures.every(m=>m.status!=='pending')) {
        const winners=fixtures.map(m=>m.winner);
        if(winners.length===1) {
          db.prepare("UPDATE tournaments SET status='completed' WHERE id=?").run(id);
        }else {
          createRound(id,round+1,winners);
        }
      }
      return {...tournamentStatus(id),applied:true};
    });
  }
  // A pending reward request is NOT proof that an ad was watched. Only a
  // trusted, separately verified provider callback may invoke settlement.
  // No public HTTP route exposes settlement without provider verification.
  function createRewardIntent(id,token,now=Date.now()) {
    if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid reward timestamp.');
    return tx(()=>{
      const account=authenticate(id,token);
      const since=now-60*60*1000;
      const count=db.prepare("SELECT COUNT(*) AS n FROM reward_intents WHERE account_id=? AND created_at>?").get(id,since).n;
      if(count>=6)throw Error('Too many reward requests. Try again later.');
      const nonce=crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO reward_intents(nonce,account_id,created_at) VALUES(?,?,?)').run(nonce,id,now);
      return {nonce,accountId:account.id,expiresAt:now+15*60*1000};
    });
  }
  // An authenticated player may poll only their own reward-intent state.
  // This never awards credits; only a verified provider settlement can do that.
  function rewardIntentStatus(id,token,nonce,now=Date.now()) {
    const account=authenticate(id,token);
    if(typeof nonce!=='string'||!/^[a-f0-9]{48}$/.test(nonce))
      throw Error('Invalid reward request.');
    if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid reward timestamp.');
    const claim=db.prepare('SELECT account_id AS accountId,created_at AS createdAt,status FROM reward_intents WHERE nonce=?').get(nonce);
    if(!claim||claim.accountId!==account.id)throw Error('Reward request not found.');
    const status=claim.status==='settled'?'settled':
      now<claim.createdAt||now-claim.createdAt>15*60*1000?'expired':'pending';
    return {status,credits:status==='settled'?30:0};
  }
  function settleVerifiedRewardIntent(nonce,eventId,now=Date.now()) {
    if(typeof nonce!=='string'||!/^[a-f0-9]{48}$/.test(nonce)||!opOK(eventId))
      throw Error('Invalid verified ad event.');
    if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid reward timestamp.');
    return tx(()=>{
      const intent=db.prepare('SELECT nonce,account_id AS accountId,created_at AS createdAt,status,event_id AS eventId FROM reward_intents WHERE nonce=?').get(nonce);
      if(!intent)throw Error('Unknown reward request.');
      if(intent.status==='settled'){
        if(intent.eventId!==eventId)throw Error('Reward request already settled by a different event.');
        return {accountId:intent.accountId,balance:get(intent.accountId).balance,applied:false};
      }
      if(now<intent.createdAt||now-intent.createdAt>15*60*1000)
        throw Error('Reward request expired.');
      const duplicate=db.prepare('SELECT account_id FROM verified_ad_events WHERE event_id=?').get(eventId);
      if(duplicate)throw Error('Provider reward event already used.');
      // A maximum of three verified rewarded ads per account per rolling 24h.
      const rewarded=db.prepare(`SELECT COUNT(*) AS n FROM reward_intents
        WHERE account_id=? AND status='settled' AND created_at>?`).get(intent.accountId,now-24*60*60*1000).n;
      if(rewarded>=3)throw Error('Daily rewarded-ad limit reached.');
      db.prepare('INSERT INTO verified_ad_events(event_id,account_id) VALUES(?,?)').run(eventId,intent.accountId);
      const changeResult=change(intent.accountId,'reward:'+eventId,30,'verified-reward');
      db.prepare("UPDATE reward_intents SET status='settled',event_id=? WHERE nonce=?").run(eventId,nonce);
      return {accountId:intent.accountId,balance:changeResult.balance,applied:true,credits:30};
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
    createAccount,authenticate,rotateRecoveryToken,credentialFingerprintCurrent,
    verifyRegistrationEmail,resendRegistrationEmail,requestEmailRecovery,completeEmailRecovery,recoverableEmail,balance,price,
    enter:(id,mode,entryId)=>tx(()=>enterInternal(id,mode,entryId)),
    refund:(id,mode,entryId)=>tx(()=>refundInternal(id,mode,entryId)),
    awardVerifiedReward,createRewardIntent,rewardIntentStatus,settleVerifiedRewardIntent,
    awardDailyLogin:(id,day)=>{
      if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid login day.');
      return tx(()=>change(id,'daily:'+day,20,'daily-login'));
    },
    enterPublic,reservePublicRematch,refundPublic,finishPublic,refundInterruptedPublicMatches,
    createTournament,joinTournament,withdrawTournament,cancelTournament,startTournament,recordTournamentWinner,openTournamentFixtureAttempt,tournamentStatus,listTournaments,myTournamentMatches,
    close:()=>db.close()
  };
}
module.exports={createSqliteWallet};
