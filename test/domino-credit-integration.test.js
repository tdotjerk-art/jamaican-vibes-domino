'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { io } = require('socket.io-client');

test('flagged credit pilot: authenticated public entry charged, private free, pregame exit refunded', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-credit-api-'));
  const child = fork(path.join(__dirname, '../test-support/credit-server.js'), [], {
    env: { ...process.env, DOMINO_CREDITS_ENABLED: 'true', DOMINO_WALLET_DIR: directory },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  t.after(() => { child.kill(); fs.rmSync(directory, { recursive: true, force: true }); });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server startup timed out')), 10000);
    child.once('message', message => { clearTimeout(timer); resolve(message.port); });
    child.once('exit', code => { clearTimeout(timer); reject(Error('Server exited: ' + code)); });
  });
  const url = 'http://127.0.0.1:' + port;
  async function request(route, data) {
    const response = await fetch(url + '/api/domino/wallet/' + route, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
    });
    return { status: response.status, body: await response.json() };
  }
  function event(socket, name) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Timed out: ' + name)), 5000);
      socket.once(name, data => { clearTimeout(timer); resolve(data); });
    });
  }
  const register = await request('register', { name: 'Junior' });
  assert.equal(register.status, 200);
  const { id, name } = register.body.account;
  const token = register.body.token;
  assert.equal(name, 'Junior');
  const player = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const guest = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => { player.disconnect(); guest.disconnect(); });
  await Promise.all([event(player, 'connect'), event(guest, 'connect')]);

  let error = event(guest, 'room-error');
  guest.emit('join-public-table', { name: 'Unverified' });
  assert.match(await error, /sign in/i);

  let assigned = event(player, 'seat-assigned');
  player.emit('join-public-table', { name: 'Spoof', accountId: id, accountToken: token });
  const seat = await assigned;
  assert.ok(seat.code);
  assert.equal((await request('me', { id, token })).body.balance, 90);
  assert.equal((await request('me', { id, token: '0'.repeat(64) })).status, 400);

  // Joining the occupied seat again with the same authenticated socket does not charge twice.
  assigned = event(player, 'seat-assigned');
  player.emit('join-public-table', { accountId: id, accountToken: token });
  await assigned;
  assert.equal((await request('me', { id, token })).body.balance, 90);

  player.emit('leave-room');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await request('me', { id, token })).body.balance, 100);

  assigned = event(player, 'seat-assigned');
  player.emit('create-room', { name: 'Private player' });
  await assigned;
  assert.equal((await request('me', { id, token })).body.balance, 100);
});
