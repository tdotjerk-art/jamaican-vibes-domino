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
  assert.match(result.stderr, /cannot run on Render with the filesystem wallet/);
});
