'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('production Render must reject the provisional filesystem credit wallet', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./server')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, RENDER: 'true', DOMINO_CREDITS_ENABLED: 'true', DOMINO_WALLET_DIR: '/tmp/not-durable' },
    encoding: 'utf8', timeout: 10000
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot run on Render without a confirmed durable SQLite disk/);
});

test('Render must reject ephemeral SQLite path even when confirmation flag is set', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./server')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, RENDER: 'true',
      DOMINO_CREDITS_ENABLED: 'true', DOMINO_CREDIT_STORAGE: 'sqlite',
      DOMINO_CREDIT_DURABLE_CONFIRMED: 'true', DOMINO_CREDIT_DB_PATH: '/tmp/unsafe/wallet.sqlite' },
    encoding: 'utf8', timeout: 10000
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must reside under Render's \/var\/data persistent disk/);
});
