'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createSqliteWallet } = require('../domino-wallet-sqlite');

test('consistent WAL backup restores wallet balances, debits and tournament registration', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-wallet-backup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const originalPath = path.join(directory, 'live.sqlite');
  const backupPath = path.join(directory, 'snapshot.sqlite');
  const restoredPath = path.join(directory, 'restore', 'wallet.sqlite');
  const wallet = createSqliteWallet(originalPath);
  t.after(() => wallet.close());

  const player = wallet.createAccount('BackupPlayer');
  wallet.createTournament('backup_cup', 2);
  assert.equal(wallet.joinTournament('backup_cup', player.id, player.token).balance, 75);
  assert.equal(wallet.enterPublic(player.id, 'backup-public-entry').balance, 65);

  // SQLite's VACUUM INTO takes a consistent, independent snapshot while the
  // source wallet remains open in WAL mode; copying only the live .sqlite file
  // would not necessarily include committed WAL transactions.
  const backupConnection = new DatabaseSync(originalPath);
  try {
    backupConnection.prepare('VACUUM INTO ?').run(backupPath);
  } finally {
    backupConnection.close();
  }

  fs.mkdirSync(path.dirname(restoredPath), { recursive: true });
  fs.copyFileSync(backupPath, restoredPath);
  const restored = createSqliteWallet(restoredPath);
  try {
    assert.equal(restored.authenticate(player.id, player.token).balance, 65);
    assert.equal(restored.tournamentStatus('backup_cup').players.length, 1);
    assert.equal(restored.joinTournament('backup_cup', player.id, player.token).applied, false);
    assert.equal(restored.enterPublic(player.id, 'backup-public-entry').applied, false);
    assert.equal(restored.balance(player.id), 65);
    // The restored snapshot retains a pending paid public match, which must
    // refund exactly once when a new server instance performs crash recovery.
    assert.equal(restored.refundInterruptedPublicMatches(), 1);
    assert.equal(restored.refundInterruptedPublicMatches(), 0);
    assert.equal(restored.balance(player.id), 75);
    assert.throws(() => restored.enterPublic(player.id, 'backup-public-entry'), /cannot be reused/i);
  } finally {
    restored.close();
  }
});
