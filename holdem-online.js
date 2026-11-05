'use strict';

const {randomBytes, randomInt} = require('node:crypto');
const {Game} = require('./public/holdem/engine');

function installHoldem(io) {
  const tables = new Map();
  const turnMs = 30000;
  const graceMs = 90000;

  function available(table) {
    return table.members.filter((member, seat) => member.socket && !member.sittingOut &&
      (!table.game || member.replacement || member.rebuy || table.game.players[seat].chips > 0));
  }

  function vacantSeat(table) {
    return table.members.findIndex(member => !member.socket && !member.token);
  }

  function deal(table, connected) {
    if (table.game && table.game.phase !== 'over') return;

    if (!table.game) {
      table.members.filter(m => !m.socket).forEach(m => clearTimeout(m.expiry));
      table.members = connected;
      table.game = new Game(() => randomInt(2 ** 32) / 2 ** 32, connected.length);
      connected.forEach((m, i) => { table.game.players[i].name = m.name; });
    }
    table.members.forEach((member, seat) => {
      if (!(member.replacement || member.rebuy) || !connected.includes(member)) return;
      Object.assign(table.game.players[seat], {name:member.name, chips:1000});
      member.replacement = false;
      member.rebuy = false;
    });
    if (table.game.start(seat => connected.includes(table.members[seat]))) progress(table);
  }

  function publish(table) {
    const ready = table.public && !table.game && available(table).length >= 2;
    if (ready && !table.startTimer) {
      table.startAt = Date.now() + 15000;
      table.startTimer = setTimeout(() => {
        table.startTimer = null;
        table.startAt = null;
        if (tables.get(table.code) !== table || table.game) return;
        const connected = available(table);
        if (connected.length >= 2) deal(table, connected);
      }, 15000);
      table.startTimer.unref();
    } else if (!ready && table.startTimer) {
      clearTimeout(table.startTimer);
      table.startTimer = null;
      table.startAt = null;
    }
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
          connected:!!table.members[index].socket, lastAction:p.lastAction,
          hand:(index === seat && !member.replacement) || (showdown && !p.folded) ? p.hand : p.hand.map(() => null)
        }))
      };
      member.socket.emit('table-state', {
        code:table.code, public:table.public === true, seat, players:table.members.map(m => m.name), game:view,
        revision:table.revision, deadline:table.deadline, startAt:table.startAt,
        seatStatuses:table.members.map((m, index) => ({
          name:m.name,
          status:!m.socket ? (m.token ? 'Reconnecting' : 'Seat open') :
            m.sittingOut ? 'Sitting out' : m.replacement ? 'Joined · plays next hand' :
            m.rebuy ? 'Rebuy ready' : game && game.players[index].chips === 0 ? 'Out of chips' : 'Ready'
        })),
        activeCount:available(table).length,
        sittingOut:!!member.sittingOut,
        canRebuy:!!(table.public && game?.phase === 'over' && game.players[seat].chips === 0 && !member.replacement && !member.rebuy),
        rebuy:!!member.rebuy,
        canDeal:available(table).length >= 2
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
      if (!table.members.length) {
        clearTimeout(table.startTimer);
        tables.delete(table.code);
      }
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
    socket.on('table-join', joinTable);
    function joinTable(input) {
      if (socket.data.table) return;
      if (Date.now() - lastEntry < 500) return fail('Wait a moment and try again.');
      lastEntry = Date.now();
      const {code, name, token, create, publicTable} = input || {};
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
      if (publicTable === true) {
        table = [...tables.values()].find(candidate =>
          candidate.code !== input?.exclude && candidate.public && candidate.members.some(member => member.socket) &&
          (candidate.game ? candidate.game.phase === 'over' && vacantSeat(candidate) >= 0 : candidate.members.length < 8));
      }
      if (create === true || (publicTable === true && !table)) {
        let id;
        do { id = randomBytes(3).toString('hex').toUpperCase(); } while (tables.has(id));
        table = {code:id, public:publicTable === true, members:[], revision:0, deadline:null};
        tables.set(id, table);
      }
      if (!table || (table.public && publicTable !== true)) return fail('Room code not found.');
      const member = {name:cleanName, token:randomBytes(24).toString('hex')};
      if (table.game) {
        const seat = publicTable === true && table.game.phase === 'over' ? vacantSeat(table) : -1;
        if (seat < 0) return fail('That table is full or has already started.');
        clearTimeout(table.members[seat].expiry);
        member.replacement = true;
        table.members[seat] = member;
      } else {
        if (table.members.length >= 8) return fail('That table is full.');
        table.members.push(member);
      }
      bind(table, member);
    }
    socket.on('table-find', () => {
      const table = socket.data.table;
      const member = table?.members.find(m => m.socket === socket);
      if (!table?.public || !member) return;
      const name = member.name, exclude = table.code;
      detach(socket, true);
      lastEntry = -Infinity;
      joinTable({name, exclude, publicTable:true});
    });
    socket.on('table-deal', revision => {
      const table = socket.data.table;
      if (!table || revision !== table.revision) return;
      const connected = available(table);
      if (connected.length < 2) return fail('Two connected players are needed to deal.');
      if (table.public && !table.game) return;
      deal(table, connected);
    });
    socket.on('table-rebuy', () => {
      const table = socket.data.table;
      const seat = table?.members.findIndex(m => m.socket === socket);
      if (!table?.public || table.game?.phase !== 'over' || seat < 0) return;
      const member = table.members[seat];
      if (table.game.players[seat].chips !== 0 || member.replacement || member.rebuy) return;
      member.rebuy = true;
      member.sittingOut = false;
      publish(table);
    });
    socket.on('table-sit-out', sittingOut => {
      const table = socket.data.table;
      const member = table?.members.find(m => m.socket === socket);
      if (!table?.game || !member || typeof sittingOut !== 'boolean') return;
      member.sittingOut = sittingOut;
      publish(table);
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
