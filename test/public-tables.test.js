const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const { server, io } = require('../server');

function waitFor(socket, event, matches = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error('Timed out waiting for ' + event));
    }, 4000);
    function listener(data) {
      if (!matches(data)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(data);
    }
    socket.on(event, listener);
  });
}

test('public seats fill in arrival order, start automatically, and skip private rooms', async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const clients = [];
  async function player() {
    const client = connect('http://127.0.0.1:' + server.address().port, {
      transports: ['websocket'], forceNew: true, reconnection: false
    });
    clients.push(client);
    await waitFor(client, 'connect');
    return client;
  }
  function join(client, name) {
    const assigned = waitFor(client, 'seat-assigned');
    client.emit('join-public-table', { name });
    return assigned;
  }

  try {
    const host = await player();
    const privateSeat = waitFor(host, 'seat-assigned');
    host.emit('create-room', { name: 'Private host' });
    const privateRoom = await privateSeat;

    const first = await player();
    const publicRoom = await join(first, 'Public 1');
    assert.notEqual(publicRoom.code, privateRoom.code);
    assert.equal(publicRoom.seat, 0);
    assert.deepEqual(await join(first, 'Public 1'), publicRoom);

    const started = waitFor(first, 'private-state', state => state.phase === 'playing');
    for (let seat = 1; seat < 4; seat++) {
      const assigned = await join(await player(), 'Public ' + (seat + 1));
      assert.equal(assigned.code, publicRoom.code);
      assert.equal(assigned.seat, seat);
    }
    assert.equal((await started).players.filter(Boolean).length, 4);

    const fifth = await player();
    const next = await join(fifth, 'Public 5');
    assert.notEqual(next.code, publicRoom.code);
    assert.notEqual(next.code, privateRoom.code);
    assert.equal(next.seat, 0);
    const sixth = await player();
    assert.equal((await join(sixth, 'Public 6')).code, next.code);
    const freed = waitFor(fifth, 'room-state', state => state.players.filter(Boolean).length === 1);
    sixth.disconnect();
    await freed;
    const replacement = await join(await player(), 'Public 7');
    assert.equal(replacement.code, next.code);
    assert.equal(replacement.seat, 1);

    const invitee = await player();
    const invited = waitFor(invitee, 'seat-assigned');
    invitee.emit('join-room', { name: 'Invited friend', code: privateRoom.code });
    assert.equal((await invited).seat, 1);
  } finally {
    clients.forEach(client => client.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
});
