'use strict';

const {once} = require('node:events');
const {createServer} = require('node:http');
const assert = require('node:assert/strict');
const test = require('node:test');
const {Server} = require('socket.io');
const {io: connect} = require('socket.io-client');
const {installHoldem} = require('../holdem-online');

test('private Hold’em seats, concealed cards, betting and reconnection', async () => {
  const server = createServer();
  const io = new Server(server);
  installHoldem(io);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const clients = [];
  const url = 'http://127.0.0.1:' + server.address().port + '/holdem';
  async function client() {
    const socket = connect(url, {transports:['websocket'], forceNew:true});
    clients.push(socket);
    await once(socket, 'connect', {signal:AbortSignal.timeout(3000)});
    return socket;
  }
  async function next(socket, event, accept = () => true) {
    const deadline = AbortSignal.timeout(3000);
    while (true) {
      const [value] = await once(socket, event, {signal:deadline});
      if (accept(value)) return value;
    }
  }
  async function send(socket, event, data, expected, accept) {
    const result = next(socket, expected, accept);
    socket.emit(event, data);
    return result;
  }
  try {
    const [host, guest] = await Promise.all([client(), client()]);
    const seat = await send(host, 'table-join', {create:true, name:'Host'}, 'table-seat');
    const lobby = await send(guest, 'table-join', {code:seat.code, name:'Guest'}, 'table-state');
    assert.equal(lobby.canDeal, true);
    const guestDeal = next(guest, 'table-state', state => state.game?.phase === 'preflop');
    const hand = await send(host, 'table-deal', lobby.revision, 'table-state', state => state.game?.phase === 'preflop');
    const guestHand = await guestDeal;
    assert.equal(hand.game.turn, 0);
    assert(hand.game.players[0].hand.every(Boolean));
    assert.deepEqual(hand.game.players[1].hand, [null,null]);
    assert.deepEqual(guestHand.game.players[0].hand, [null,null]);
    assert.equal(guestHand.game.legalMove, null);
    assert(hand.deadline > Date.now());
    const invalid = await send(guest, 'table-act', {revision:hand.revision,type:'check'}, 'table-error');
    assert.match(invalid, /not available/);
    const advanced = await send(host, 'table-act', {revision:hand.revision,type:'call'}, 'table-state');
    assert.equal(advanced.game.turn, 1);
    host.disconnect();
    const restored = await client();
    const restoredHand = await send(restored, 'table-join', seat, 'table-state');
    assert.equal(restoredHand.seat, 0);
    assert.deepEqual(restoredHand.game.players[0].hand, hand.game.players[0].hand);
    const flop = await send(guest, 'table-act', {revision:advanced.revision,type:'check'}, 'table-state', state => state.game?.phase === 'flop');
    assert.equal(flop.game.phase, 'flop');
    assert.equal(flop.game.board.length, 3);
  } finally {
    clients.forEach(socket => socket.disconnect());
    await io.close();
  }
});
