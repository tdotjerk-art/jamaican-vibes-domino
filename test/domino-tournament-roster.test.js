'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWalletStore } = require('../domino-wallet');
const { createTournamentRoster } = require('../domino-tournament-roster');

test('registered accounts pay once, capacity enforced, and cancellation refunds once', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-bracket-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const wallet = createWalletStore(dir);
  const roster = createTournamentRoster(wallet);
  const a = wallet.createAccount('Alpha');
  const b = wallet.createAccount('Bravo');
  const c = wallet.createAccount('Charlie');
  roster.create('event_1', 2);
  assert.equal(roster.join('event_1', a.id, a.token).balance, 75);
  assert.equal(roster.join('event_1', a.id, a.token).applied, false);
  assert.equal(wallet.balance(a.id), 75);
  assert.equal(roster.join('event_1', b.id, b.token).balance, 75);
  assert.throws(() => roster.join('event_1', c.id, c.token), /full/);
  assert.equal(wallet.balance(c.id), 100);
  assert.throws(() => roster.withdraw('event_1', a.id, '0'.repeat(64)), /credentials/);
  assert.equal(roster.cancel('event_1').status, 'cancelled');
  assert.equal(wallet.balance(a.id), 100);
  assert.equal(wallet.balance(b.id), 100);
  assert.throws(() => roster.cancel('event_1'), /Only an open/);
  assert.throws(() => roster.join('event_1', c.id, c.token), /closed/);
});

test('withdrawals refund, free a seat and never allow cancelled entry ID reuse', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-bracket-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const wallet = createWalletStore(dir);
  const roster = createTournamentRoster(wallet);
  const a = wallet.createAccount('Alpha');
  const b = wallet.createAccount('Bravo');
  roster.create('event_2', 2);
  roster.join('event_2', a.id, a.token);
  assert.equal(roster.withdraw('event_2', a.id, a.token).balance, 100);
  assert.throws(() => roster.join('event_2', a.id, a.token), /cannot be reused/);
  assert.equal(roster.status('event_2').players.length, 0);
  roster.join('event_2', b.id, b.token);
  assert.throws(() => roster.start('event_2'), /at least two/);
  assert.throws(() => roster.create('event_2', 3), /already exists/);
  assert.throws(() => roster.create('../unsafe', 4), /Invalid tournament ID/);
});

test('started tournament rejects late joins and withdrawals', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-bracket-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const wallet = createWalletStore(dir);
  const roster = createTournamentRoster(wallet);
  const a = wallet.createAccount('Alpha');
  const b = wallet.createAccount('Bravo');
  roster.create('finals', 4);
  roster.join('finals', a.id, a.token);
  roster.join('finals', b.id, b.token);
  assert.equal(roster.start('finals').status, 'started');
  assert.throws(() => roster.withdraw('finals', a.id, a.token), /closed/);
  assert.throws(() => roster.join('finals', a.id, a.token), /closed/);
  assert.equal(wallet.balance(a.id), 75);
});
