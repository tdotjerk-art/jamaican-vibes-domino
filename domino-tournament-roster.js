'use strict';

// Development-only, single-process tournament coordinator. This does not create
// or expose a public tournament API. A durable, transactional roster is required
// before production integration or accepting live tournament entries.
function createTournamentRoster(wallet) {
  if (!wallet || typeof wallet.registerTournament !== 'function')
    throw Error('Tournament wallet is required.');
  const brackets = new Map();
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(id);

  function get(id) {
    if (!validId(id)) throw Error('Invalid tournament ID.');
    const bracket = brackets.get(id);
    if (!bracket) throw Error('Tournament not found.');
    return bracket;
  }
  function snapshot(bracket) {
    return { id: bracket.id, status: bracket.status, capacity: bracket.capacity,
      players: [...bracket.players.values()].map(p => ({ id: p.id, name: p.name })),
      placesRemaining: bracket.capacity - bracket.players.size };
  }
  function create(id, capacity) {
    if (!validId(id)) throw Error('Invalid tournament ID.');
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 128)
      throw Error('Invalid tournament capacity.');
    if (brackets.has(id)) throw Error('Tournament already exists.');
    const bracket = { id, status: 'open', capacity, players: new Map() };
    brackets.set(id, bracket);
    return snapshot(bracket);
  }
  function join(id, accountId, token) {
    const bracket = get(id);
    const account = wallet.authenticate(accountId, token);
    if (bracket.status !== 'open') throw Error('Tournament registration is closed.');
    if (bracket.players.has(account.id)) return { ...snapshot(bracket), applied: false };
    if (bracket.players.size >= bracket.capacity) throw Error('Tournament is full.');
    // No await between the capacity check, wallet charge, and roster insertion.
    // This protects a single Node process, NOT multiple server instances.
    const payment = wallet.registerTournament(account.id, id);
    if (!payment.applied)
      throw Error('Existing tournament charge has no roster seat; manual reconciliation required.');
    bracket.players.set(account.id, { id: account.id, name: account.name });
    return { ...snapshot(bracket), applied: true, balance: payment.balance };
  }
  function withdraw(id, accountId, token) {
    const bracket = get(id);
    const account = wallet.authenticate(accountId, token);
    if (bracket.status !== 'open') throw Error('Tournament registration is closed.');
    if (!bracket.players.has(account.id)) throw Error('Not registered for tournament.');
    const payment = wallet.cancelTournamentRegistration(account.id, id);
    bracket.players.delete(account.id);
    return { ...snapshot(bracket), applied: payment.applied, balance: payment.balance };
  }
  function start(id) {
    const bracket = get(id);
    if (bracket.status !== 'open') throw Error('Tournament registration is closed.');
    if (bracket.players.size < 2) throw Error('Tournament needs at least two players.');
    bracket.status = 'started';
    return snapshot(bracket);
  }
  function cancel(id) {
    const bracket = get(id);
    if (bracket.status !== 'open') throw Error('Only an open tournament can be cancelled.');
    // All refunds are idempotent. Do not close until every refund succeeds;
    // repeat calls retry incomplete refunds.
    for (const accountId of bracket.players.keys())
      wallet.cancelTournamentRegistration(accountId, id);
    bracket.players.clear();
    bracket.status = 'cancelled';
    return snapshot(bracket);
  }
  return { create, join, withdraw, start, cancel, status: id => snapshot(get(id)) };
}
module.exports = { createTournamentRoster };
