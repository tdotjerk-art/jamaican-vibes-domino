'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWalletStore } = require('../domino-wallet');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-wallet-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, wallet: createWalletStore(directory) };
}

test('new account starts with 100 credits and authenticates by secret', t => {
  const { wallet } = fixture(t);
  const account = wallet.createAccount('Junior');
  assert.equal(account.balance, 100);
  assert.equal(wallet.authenticate(account.id, account.token).balance, 100);
  assert.throws(() => wallet.authenticate(account.id, '0'.repeat(64)), /credentials/);
  assert.throws(() => wallet.createAccount('TdotPlayer'), /reserved/);
});

test('public entry costs 10, tournament costs 25, free modes cost zero', t => {
  const { wallet } = fixture(t);
  const { id } = wallet.createAccount('Player');
  assert.equal(wallet.enter(id, 'computer', 'practice1').cost, 0);
  assert.equal(wallet.enter(id, 'private', 'friends1').cost, 0);
  assert.equal(wallet.balance(id), 100);
  assert.equal(wallet.enter(id, 'public', 'match1').balance, 90);
  assert.equal(wallet.enter(id, 'tournament', 'bracket1').balance, 65);
});

test('duplicate entries do not double charge and a refund happens once', t => {
  const { wallet } = fixture(t);
  const { id } = wallet.createAccount('Player');
  assert.equal(wallet.enter(id, 'public', 'match1').applied, true);
  assert.equal(wallet.enter(id, 'public', 'match1').applied, false);
  assert.equal(wallet.balance(id), 90);
  assert.equal(wallet.refund(id, 'public', 'match1').applied, true);
  assert.equal(wallet.refund(id, 'public', 'match1').applied, false);
  assert.equal(wallet.balance(id), 100);
  assert.throws(() => wallet.refund(id, 'public', 'never'), /not charged/);
});

test('wallet survives restart and prevents insufficient balance', t => {
  const { directory, wallet } = fixture(t);
  const { id, token } = wallet.createAccount('Player');
  wallet.enter(id, 'tournament', 't1');
  const reopened = createWalletStore(directory);
  assert.equal(reopened.authenticate(id, token).balance, 75);
  for (let i = 0; i < 3; i++) reopened.enter(id, 'tournament', 'next' + i);
  assert.equal(reopened.balance(id), 0);
  assert.throws(() => reopened.enter(id, 'public', 'extra'), /Insufficient/);
  assert.equal(reopened.balance(id), 0);
});

test('daily reward and verified ad event are idempotent', t => {
  const { wallet } = fixture(t);
  const { id } = wallet.createAccount('Player');
  wallet.awardDailyLogin(id, '2026-11-17');
  wallet.awardDailyLogin(id, '2026-11-17');
  wallet.awardVerifiedReward(id, 'provider-456');
  wallet.awardVerifiedReward(id, 'provider-456');
  assert.equal(wallet.balance(id), 150);
});
