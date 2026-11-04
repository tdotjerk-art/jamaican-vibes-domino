'use strict';

const {randomBytes, randomInt} = require('node:crypto');
const {Game} = require('./public/holdem/engine');

function installHoldem(io) {
  const tables = new Map();
  const turnMs = 30000;
  const graceMs = 90000;

  function publish(table) {
    const game = table.game;
    const showdown = game?.phase === 'over' && game.players.filter(p => !p.folded).length > 1;
    for (const [seat, member] of table.members.entries()) {
      if (!member.socket) continue;
      const view = game && {
        phase:game.phase, board:game.board, turn:game.turn, dealer:game.dealer,
        small:game.small, big:game.big, bigBlind:game.bigBlind, currentBet:game.currentBet,
        handNumber:game.handNumber, results:game.results, log:game.log, handLog:game.handLog,
        message:game.message, tournament:false, legalMove:game.legal(seat),
        actingCall:game.turn == null ? 0 : game.legal(game.turn)?.call,
        players:game.players.map((p, index) => ({
          name:p.name, chips:p.chips, bet:p.bet, total:p.total, folded:p.folded,
          connected:!!table.members[index].socket,
          hand:index === seat || (showdown && !p.folded) ? p.hand : p.hand.map(() => null)
        }))
      };
      member.socket.emit('table-state', {
        code:table.code, seat, players:table.members.map(m => m.name), game:view,
        revision:table.revision, deadline:table.deadline,
        canDeal:table.members.filter(m => m.socket).length >= 2 &&
          (!game || game.players.filter(p => p.chips > 0).length >= 2)
      });
    }
  }

  function progress(table) {
    clearTimeout(table.turnTimer);
    const game = table.game;
    table.revision++;
    table.deadline = game.turn == null ? null : Date.now() + turnMs;
    if (table.deadline) {
      table.turnTimer = setTimeout(() => {
        const seat = game.turn;
        game.act(seat, game.legal(seat).call ? 'fold' : 'check');
        progress(table);
      }, turnMs);
      table.turnTimer.unref();
    }
    publish(table);
  }

  function detach(socket, leaving) {
    const table = socket.data.table;
    const member = table?.members.find(m => m.socket === socket);
    if (!member) return;
    socket.data.table = null;
    member.socket = null;
    if (leaving) member.token = null;
    clearTimeout(member.expiry);
    if (!table.game && leaving) {
      table.members.splice(table.members.indexOf(member), 1);
      if (!table.members.length) tables.delete(table.code);
      else publish(table);
      return;
    }
    member.expiry = setTimeout(() => {
      member.token = null;
      const index = table.members.indexOf(member);
      if (!table.game && index !== -1) table.members.splice(index, 1);
      if (!table.members.some(m => m.socket || m.token)) {
        clearTimeout(table.turnTimer);
        tables.delete(table.code);
      } else publish(table);
    }, graceMs);
    member.expiry.unref();
    if (leaving && !table.members.some(m => m.socket || m.token)) {
      clearTimeout(member.expiry);
      clearTimeout(table.turnTimer);
      tables.delete(table.code);
    } else publish(table);
  }

  io.of('/holdem').on('connection', socket => {
    const fail = message => socket.emit('table-error', message);
    function bind(table, member) {
      member.socket = socket;
      clearTimeout(member.expiry);
      socket.data.table = table;
      socket.emit('table-seat', {code:table.code, token:member.token});
      publish(table);
    }
    let lastEntry = -Infinity;
    socket.on('table-join', (input) => {
      if (socket.data.table) return;
      if (Date.now() - lastEntry < 500) return fail('Wait a moment and try again.');
      lastEntry = Date.now();
      const {code, name, token, create} = input || {};
      const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
      let table = tables.get(cleanCode);
      if (typeof token === 'string') {
        const member = table?.members.find(m => m.token === token);
        if (!member) return fail('Your seat is no longer available.');
        if (member.socket) {
          member.socket.data.table = null;
          member.socket.disconnect();
        }
        return bind(table, member);
      }
      const cleanName = typeof name === 'string' ? name.trim().slice(0,20) : '';
      if (!cleanName) return fail('Enter your name first.');
      if (create === true) {
        let id;
        do { id = randomBytes(3).toString('hex').toUpperCase(); } while (tables.has(id));
        table = {code:id, members:[], revision:0, deadline:null};
        tables.set(id, table);
      }
      if (!table) return fail('Room code not found.');
      if (table.game || table.members.length >= 10) return fail('That table is full or has already started.');
      const member = {name:cleanName, token:randomBytes(24).toString('hex')};
      table.members.push(member);
      bind(table, member);
    });
    socket.on('table-deal', revision => {
      const table = socket.data.table;
      if (!table || revision !== table.revision) return;
      const connected = table.members.filter(m => m.socket);
      if (connected.length < 2) return fail('Two connected players are needed to deal.');
      if (!table.game) {
        table.members.filter(m => !m.socket).forEach(m => clearTimeout(m.expiry));
        table.members = connected;
        table.game = new Game(() => randomInt(2 ** 32) / 2 ** 32, connected.length);
        connected.forEach((m, i) => { table.game.players[i].name = m.name; });
      }
      if (table.game.start()) progress(table);
    });
    socket.on('table-act', (input) => {
      const table = socket.data.table;
      const {type, target, revision} = input || {};
      if (!table?.game || revision !== table.revision) return;
      const seat = table.members.findIndex(m => m.socket === socket);
      if (!['check','fold','call','raise'].includes(type) || !table.game.act(seat, type, target)) {
        return fail('That action is not available.');
      }
      progress(table);
    });
    socket.on('table-leave', () => detach(socket, true));
    socket.on('disconnect', () => detach(socket, false));
  });
}

module.exports = {installHoldem};
