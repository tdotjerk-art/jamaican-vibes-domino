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
  assert.throws(() => wallet.createAccount('junior'), /already registered/i);
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


test('refunded entry IDs cannot be reused, even after restart', t => {
  const { directory, wallet } = fixture(t);
  const { id } = wallet.createAccount('RefundGuard');
  wallet.enter(id, 'tournament', 'bracket1');
  wallet.refund(id, 'tournament', 'bracket1');
  assert.throws(() => wallet.enter(id, 'tournament', 'bracket1'), /cannot be reused/);
  const restarted = createWalletStore(directory);
  assert.throws(() => restarted.enter(id, 'tournament', 'bracket1'), /cannot be reused/);
  assert.equal(restarted.balance(id), 100);
  assert.equal(restarted.enter(id, 'tournament', 'bracket2').balance, 75);
});


test('tournament signup charges once and cancellation refunds once', t => {
  const { wallet } = fixture(t);
  const { id } = wallet.createAccount('TournamentPlayer');
  assert.deepEqual(wallet.tournamentRegistration(id, 'round_1'), {
    tournamentId: 'round_1', registered: false, cancelled: false
  });
  assert.equal(wallet.registerTournament(id, 'round_1').balance, 75);
  assert.equal(wallet.registerTournament(id, 'round_1').applied, false);
  assert.equal(wallet.tournamentRegistration(id, 'round_1').registered, true);
  assert.equal(wallet.cancelTournamentRegistration(id, 'round_1').balance, 100);
  assert.equal(wallet.cancelTournamentRegistration(id, 'round_1').applied, false);
  assert.deepEqual(wallet.tournamentRegistration(id, 'round_1'), {
    tournamentId: 'round_1', registered: false, cancelled: true
  });
  assert.throws(() => wallet.registerTournament(id, 'round_1'), /cannot be reused/);
  assert.throws(() => wallet.registerTournament(id, '../bad'), /Invalid tournament ID/);
  assert.equal(wallet.registerTournament(id, 'round_2').balance, 75);
});

test('tournament registration survives a server wallet reload', t => {
  const { directory, wallet } = fixture(t);
  const { id } = wallet.createAccount('BracketPlayer');
  wallet.registerTournament(id, 'championship');
  const restored = createWalletStore(directory);
  assert.equal(restored.tournamentRegistration(id, 'championship').registered, true);
  assert.equal(restored.registerTournament(id, 'championship').applied, false);
  assert.equal(restored.balance(id), 75);
  restored.cancelTournamentRegistration(id, 'championship');
  const reopened = createWalletStore(directory);
  assert.equal(reopened.tournamentRegistration(id, 'championship').cancelled, true);
  assert.equal(reopened.balance(id), 100);
});
