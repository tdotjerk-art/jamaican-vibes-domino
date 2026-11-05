'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../public/holdem/engine');

function node() {
  const result = {children:[], attributes:{}, className:'', _text:'',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this._text = ''; this.children = children; },
    setAttribute(key, value) { this.attributes[key] = value; },
    showModal() { this.open = true; }, close() { this.open = false; }};
  Object.defineProperty(result, 'textContent', {
    get() { return this._text + this.children.map(child => child.textContent).join(''); },
    set(value) { this._text = String(value); this.children = []; }
  });
  result.classList = {
    contains: name => result.className.split(' ').includes(name),
    add(...names) { result.className += ' ' + names.join(' '); },
    remove(...names) { result.className = result.className.split(' ').filter(name => !names.includes(name)).join(' '); },
    toggle(name, force) {
      const enabled = force ?? !this.contains(name);
      this.remove(name);
      if (enabled) this.add(name);
      return enabled;
    }
  };
  return result;
}
function descendants(root) { return root.children.flatMap(child => [child, ...descendants(child)]); }
function fixture({folded = false, viewer = null} = {}) {
  const card = (rank, suit) => ({rank, suit});
  const state = new E.Game(Math.random, 3);
  Object.assign(state, {phase:'over', handNumber:1, dealer:0, turn:null,
    board:[card(13,'♣'), card(12,'♦'), card(11,'♥'), card(5,'♠'), card(2,'♣')],
    results:folded ? [{amount:161, winners:[1]}] : [{amount:101, winners:[0,1]}, {amount:60, winners:[1]}]});
  state.players.forEach((p, i) => Object.assign(p, {
    name:['Alpha','Bravo','Charlie'][i], total:[50,110,1][i],
    hand:[[card(14,'♥'),card(10,'♠')],[card(14,'♠'),card(10,'♣')],[card(8,'♦'),card(9,'♣')]][i],
    folded:i === 2 || (folded && i === 0), chips:[1000,1100,900][i]
  }));
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  let initial = true;
  class Game extends E.Game {
    constructor(...args) { super(...args); if (initial) { initial = false; Object.assign(this, state); } }
  }
  const storage = new Map();
  const handlers = new Map();
  const socket = {connected:true, on:(event, fn) => handlers.set(event, fn), emit() {}};
  const context = {JVHoldem:{...E, Game}, URLSearchParams, location:{search:''},
    document:{body:node(), getElementById:get, createElement:node},
    localStorage:{getItem:() => null, setItem() {}},
    sessionStorage:{getItem:key => storage.get(key) || null, setItem:(key, value) => storage.set(key,value)},
    addEventListener() {}, setTimeout:() => 1, clearTimeout() {},
    setInterval:() => 1, clearInterval() {}, confirm:() => true};
  if (viewer !== null) context.io = () => socket;
  vm.runInNewContext(fs.readFileSync('public/holdem/ui.js','utf8'), context);
  if (viewer !== null) {
    get('friendsButton').onclick();
    handlers.get('table-state')({code:'ABC123', seat:viewer, revision:1, players:state.players.map(p => p.name), game:state});
  }
  return {get};
}

test('split and side-pot winners all receive badges while only one best five is highlighted', () => {
  const {get} = fixture();
  const seats = get('seats').children;
  assert.equal(descendants(seats[0]).find(n => n.className === 'winner-badge').textContent, 'SPLIT');
  assert.equal(descendants(seats[1]).find(n => n.className === 'winner-badge').textContent, 'SPLIT');
  assert.equal(descendants(seats[2]).filter(n => n.className === 'winner-badge').length, 0);
  const highlighted = [...descendants(get('seats')), ...descendants(get('board'))].filter(n => n.classList.contains('winning-card'));
  assert.equal(highlighted.length, 5);
  assert.equal(descendants(seats[0]).filter(n => n.classList.contains('winning-card')).length, 2);
  assert.equal(descendants(seats[1]).filter(n => n.classList.contains('winning-card')).length, 0);
  assert.match(get('message').textContent, /Main pot · 101 chips · Split — Bravo \+51 \/ Alpha \+50/);
  assert.match(get('message').textContent, /Side pot 1 · 60 chips — Bravo \+60/);
  assert.match(get('winnerNotice').textContent, /Bravo · 111.*Alpha · 50/);
  get('actions').children.find(n => n.textContent === 'Hand recap').onclick();
  assert.equal(get('handRecap').open, true);
  assert.match(get('potPayouts').textContent, /Bravo · \+51 chipsAlpha · \+50 chips/);
  assert.match(get('potPayouts').textContent, /Side pot 1 · 60 chipsBravo · \+60 chips/);
  get('reset').onclick();
  assert.equal(descendants(get('seats')).filter(n => n.className === 'winner-badge').length, 0);
  assert.equal(get('winnerNotice').hidden, true);
});

test('online viewer who shares a pot gets their own five-card highlight and the same payouts', () => {
  const {get} = fixture({viewer:1});
  const seats = get('seats').children;
  assert.equal(descendants(seats[0]).filter(n => n.classList.contains('winning-card')).length, 0);
  assert.equal(descendants(seats[1]).filter(n => n.classList.contains('winning-card')).length, 2);
  assert.match(get('message').textContent, /Bravo \+51 \/ Alpha \+50/);
});

test('a fold win has a WIN badge and exact payout without revealing or highlighting opponents', () => {
  const {get} = fixture({folded:true});
  const seats = get('seats').children;
  assert.equal(descendants(seats[1]).find(n => n.className === 'winner-badge').textContent, 'WIN');
  assert.equal([...descendants(get('seats')), ...descendants(get('board'))].filter(n => n.classList.contains('winning-card')).length, 0);
  assert.equal(descendants(seats[1]).filter(n => n.attributes['aria-label'] === 'Face-down card').length, 2);
  assert.match(get('message').textContent, /Main pot · 161 chips — Bravo \+161/);
});
