'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STARTING_CREDITS = 100;
const PRICES = Object.freeze({ public: 10, tournament: 25, computer: 0, private: 0 });
const MAX_CREDITS = 1000000;
const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const validKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validOperation = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function createWalletStore(directory) {
  // A real persistent disk or shared database is REQUIRED for production.
  // This module must never be enabled against ephemeral Render storage.
  if (!directory || !path.isAbsolute(directory)) throw Error('Wallet needs an absolute durable storage directory.');
  const root = path.join(directory, 'domino-wallets');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const wallets = new Map();

  function validate(record) {
    if (!record || !validId(record.id) || !validKey(record.tokenHash) ||
        typeof record.name !== 'string' || record.name.length < 1 || record.name.length > 20 ||
        !Number.isSafeInteger(record.balance) || record.balance < 0 || record.balance > MAX_CREDITS ||
        !record.operations || typeof record.operations !== 'object' || Array.isArray(record.operations)) {
      throw Error('Invalid wallet record.');
    }
    return record;
  }

  function persist(record) {
    const file = path.join(root, record.id + '.json');
    const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temp, file);
      const dirfd = fs.openSync(root, 'r');
      try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    wallets.set(record.id, record);
  }

  function get(id) {
    if (!validId(id)) throw Error('Invalid account ID.');
    if (wallets.has(id)) return wallets.get(id);
    const file = path.join(root, id + '.json');
    if (!fs.existsSync(file)) throw Error('Account not found.');
    const record = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
    wallets.set(id, record);
    return record;
  }

  function authenticate(id, token) {
    const record = get(id);
    if (!validKey(token) ||
        !crypto.timingSafeEqual(Buffer.from(record.tokenHash, 'hex'), Buffer.from(hash(token), 'hex'))) {
      throw Error('Invalid wallet credentials.');
    }
    return { id: record.id, name: record.name, balance: record.balance };
  }

  function createAccount(name) {
    if (typeof name !== 'string') throw Error('Invalid player name.');
    name = name.trim();
    if (!name || name.length > 20 || /tdot/i.test(name)) throw Error('Invalid or reserved player name.');
    const id = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    persist({ id, name, tokenHash: hash(token), balance: STARTING_CREDITS, operations: Object.create(null) });
    return { id, name, token, balance: STARTING_CREDITS };
  }

  function price(mode) {
    if (!Object.hasOwn(PRICES, mode)) throw Error('Unknown game mode.');
    return PRICES[mode];
  }

  function transact(id, operationId, delta, reason) {
    if (!validOperation(operationId) || !Number.isSafeInteger(delta) || !delta ||
        typeof reason !== 'string' || !reason || reason.length > 100) throw Error('Invalid transaction.');
    const old = get(id);
    const prior = Object.hasOwn(old.operations, operationId) ? old.operations[operationId] : null;
    if (prior) {
      if (prior.delta !== delta || prior.reason !== reason) throw Error('Transaction ID conflict.');
      return { balance: old.balance, applied: false };
    }
    const balance = old.balance + delta;
    if (!Number.isSafeInteger(balance) || balance < 0) throw Error('Insufficient credits.');
    if (balance > MAX_CREDITS) throw Error('Wallet balance limit exceeded.');
    const record = { ...old, balance, operations: { ...old.operations, [operationId]: { delta, reason, at: Date.now() } } };
    persist(record);
    return { balance, applied: true };
  }

  function enter(id, mode, entryId) {
    const cost = price(mode);
    if (!cost) return { balance: get(id).balance, applied: false, cost: 0 };
    const result = transact(id, 'entry:' + entryId, -cost, mode);
    return { ...result, cost };
  }

  function refund(id, mode, entryId) {
    const cost = price(mode);
    if (!cost) return { balance: get(id).balance, applied: false };
    const original = get(id).operations['entry:' + entryId];
    if (!original || original.delta !== -cost || original.reason !== mode) throw Error('Entry not charged.');
    return transact(id, 'refund:' + entryId, cost, 'refund:' + mode);
  }

  return {
    createAccount, authenticate, balance: id => get(id).balance, price, enter, refund,
    // Rewarded ads must be validated on the server by the ad provider before calling this.
    awardVerifiedReward: (id, verifiedProviderEventId) =>
      transact(id, 'reward:' + verifiedProviderEventId, 30, 'verified-reward'),
    awardDailyLogin: (id, calendarDay) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDay)) throw Error('Invalid login day.');
      return transact(id, 'daily:' + calendarDay, 20, 'daily-login');
    }
  };
}

module.exports = { createWalletStore, STARTING_CREDITS, PRICES };
