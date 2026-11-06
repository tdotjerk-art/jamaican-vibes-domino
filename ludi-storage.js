'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('./public/ludi/engine');

// One atomic snapshot per room keeps a move independent of other tables.
// This directory must be on a persistent disk, never under public/.
function createLudiStorage(directory) {
  if (!directory) return {enabled:false, load:()=>[], save:()=>{}, remove:()=>{}};
  const root = path.resolve(directory);
  const publicRoot = path.join(__dirname, 'public');
  if (root === publicRoot || root.startsWith(publicRoot + path.sep)) {
    throw Error('LUDI storage must be outside the public directory.');
  }
  fs.mkdirSync(root, {recursive:true, mode:0o700});
  const filename = code => {
    if (!/^[A-F0-9]{8}$/.test(code)) throw Error('Invalid saved LUDI room code.');
    return path.join(root, code + '.json');
  };
  const syncDirectory = () => {
    const fd = fs.openSync(root, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  };
  function save(room) {
    const {code,total,seats,game,version,votes,expires,deadline,publicTable,createdAt,matchId,results} = room;
    const destination = filename(code);
    const temporary = destination + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({schemaVersion:1, room:{code,total,seats,game,version,votes,expires,deadline,publicTable,createdAt,matchId,results}}));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, destination);
      syncDirectory();
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  function remove(code) {
    try { fs.unlinkSync(filename(code)); syncDirectory(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  function load({keepExpired=false}={}) {
    const rooms = [];
    for (const entry of fs.readdirSync(root)) {
      if (!/^[A-F0-9]{8}\.json$/.test(entry)) continue; // Ignore unfinished atomic writes.
      const saved = JSON.parse(fs.readFileSync(path.join(root, entry), 'utf8'));
      if (saved.schemaVersion !== 1 || !validRoom(saved.room) || saved.room.code + '.json' !== entry) {
        throw Error('Invalid saved LUDI room: ' + entry);
      }
      rooms.push(saved.room);
    }
    if (keepExpired) return rooms;
    // Validate everything before pruning: a corrupt snapshot must never be overwritten.
    for (const room of rooms) if (room.expires <= Date.now()) remove(room.code);
    return rooms.filter(room => room.expires > Date.now());
  }
  return {enabled:true, load, save, remove};
}

function validRoom(r) {
  if (!r || !/^[A-F0-9]{8}$/.test(r.code) || !Number.isInteger(r.total) || r.total < 2 || r.total > 4 ||
      !Number.isSafeInteger(r.version) || r.version < 0 || !Number.isFinite(r.expires) ||
      !(r.deadline === null || Number.isFinite(r.deadline)) || !Array.isArray(r.seats) ||
      r.seats.length < 1 || r.seats.length > r.total ||
      r.seats.some(p => !p || E.cleanName(p.name) !== p.name || !p.name || !/^[a-f0-9]{64}$/.test(p.key)) ||
      new Set(r.seats.map(p=>p.key)).size !== r.seats.length || !Array.isArray(r.votes) ||
      r.votes.some(s=>!Number.isInteger(s) || s < 0 || s >= r.total) || new Set(r.votes).size !== r.votes.length) return false;
  if (r.publicTable !== undefined && typeof r.publicTable !== 'boolean' || r.createdAt !== undefined && !Number.isFinite(r.createdAt) || r.matchId !== undefined && !/^[a-f0-9]{32}$/.test(r.matchId) || r.results !== undefined && (!Array.isArray(r.results) || !r.results.every(require('./ludi-community').validResult)) || r.seats.some(p=>p.profileId !== undefined && !/^[a-f0-9]{32}$/.test(p.profileId) || p.lastSeen !== undefined && !Number.isFinite(p.lastSeen))) return false;
  if (r.game === null) return r.votes.length === 0;
  const g = r.game;
  return g && r.seats.length === r.total && Array.isArray(g.players) && g.players.length === r.total &&
    g.players.every((p,i)=>p && p.name === r.seats[i].name && p.color === (r.total === 2 ? i*2 : i) &&
      Array.isArray(p.tokens) && p.tokens.length === 4 && p.tokens.every(n=>Number.isInteger(n) && n >= -1 && n <= E.HOME)) &&
    Number.isInteger(g.turn) && g.turn >= 0 && g.turn < r.total && ['roll','move','over'].includes(g.phase) &&
    Array.isArray(g.dice) && g.dice.length === 2 && g.dice.every(d=>d === null || Number.isInteger(d) && d >= 1 && d <= 6) &&
    Array.isArray(g.remaining) && g.remaining.every(d=>d === 0 || d === 1) && new Set(g.remaining).size === g.remaining.length &&
    (g.phase !== 'move' || g.remaining.length > 0 && g.dice.every(Number.isInteger)) &&
    Array.isArray(g.capturedThisRoll) && g.capturedThisRoll.every(n=>Number.isInteger(n) && n >= 0 && n < 4) &&
    Number.isSafeInteger(g.rollNo) && g.rollNo >= 0 && typeof g.bonus === 'boolean' &&
    (g.winner === null || Number.isInteger(g.winner) && g.winner >= 0 && g.winner < r.total) &&
    (g.phase !== 'over' || g.winner !== null && g.players[g.winner].tokens.every(n=>n === E.HOME)) &&
    Array.isArray(g.history) && g.history.length <= 40 && g.history.every(s=>typeof s === 'string');
}

module.exports = {createLudiStorage};
