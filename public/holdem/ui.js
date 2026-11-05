(()=>{'use strict';const $=id=>document.getElementById(id),E=JVHoldem;let game=new E.Game(),timer;
let previous, soundContext, alertedTurn, warnedTurn;
let socket, online, practice, clock;
const tablePositions = [0, 1, 2, 4, 5, 6, 8, 9];
const seatOfUser = () => online?.seat ?? 0;
function connectFriends() {
  if (socket) return socket;
  socket = globalThis.io('/holdem');
  socket.on('connect', () => {
    const saved = sessionStorage.getItem('holdem-private-seat');
    if (saved) socket.emit('table-join', JSON.parse(saved));
  });
  socket.on('table-seat', seat => sessionStorage.setItem('holdem-private-seat', JSON.stringify(seat)));
  socket.on('table-error', message => {
    $('friendsStatus').textContent = message;
    $('error').textContent = message;
    if (message === 'Your seat is no longer available.') {
      sessionStorage.removeItem('holdem-private-seat');
      leaveFriends(false);
    }
  });
  socket.on('connect_error', () => { $('friendsStatus').textContent = 'Could not connect. Trying again…'; });
  socket.on('disconnect', () => {
    if (online) {
      $('actions').replaceChildren();
      $('friendsStatus').textContent = 'Reconnecting to your seat…';
      $('message').textContent = 'Connection lost. Reconnecting to your seat…';
    }
  });
  socket.on('table-state', state => {
    if (!online) practice = game;
    online = state;
    if (state.game) {
      const startingHand = state.game.handNumber !== game.handNumber;
      game = Object.assign(onlineGame(state), state.game);
      if (startingHand && $('friendsLobby').open) $('friendsLobby').close();
    } else {
      game = onlineGame(state);
      game.phase = 'lobby';
      game.players = state.players.map(name => ({name, chips:1000, total:0, hand:[]}));
    }
    if (!state.game && (state.public || state.canDeal) && $('friendsLobby').open) $('friendsLobby').close();
    $('friendsFields').hidden = $('friendsCreate').hidden = $('friendsJoin').hidden = $('publicJoin').hidden = true;
    $('friendsLeave').hidden = false;
    $('friendsInvite').hidden = state.public;
    $('friendsFind').hidden = !state.public;
    $('friendsSeats').replaceChildren(...(state.seatStatuses || []).map(({name,status}) => el('li', name + ' · ' + status)));
    $('friendsSit').hidden = !state.game;
    $('friendsSit').textContent = state.sittingOut ? 'Return next hand' : 'Sit out next hand';
    $('friendsStatus').textContent = (state.sittingOut ? 'Sitting out next hand · ' : '') + (state.public ? 'Public table' : 'Room ' + state.code) + ' · ' + state.players.join(', ');
    render();
  });
  return socket;
}
function onlineGame(state) {
  return {board:[], log:[], handNumber:0, bigBlind:20, legal:() => state.game?.legalMove};
}
function leaveFriends(notify = true) {
  if (notify) socket?.emit('table-leave');
  sessionStorage.removeItem('holdem-private-seat');
  if (online) game = practice;
  online = null;
  clearInterval(clock);
  $('friendsFields').hidden = $('friendsCreate').hidden = $('friendsJoin').hidden = $('publicJoin').hidden = false;
  $('friendsLeave').hidden = true;
  $('friendsInvite').hidden = true;
  $('friendsFind').hidden = true;
  $('friendsSeats').replaceChildren();
  $('friendsSit').hidden = true;
  $('friendsStatus').textContent = '';
  render();
}
function requestRoom(create, publicTable = false) {
  const client = connectFriends();
  if (!client.connected) {
    $('friendsStatus').textContent = 'Connecting… Try again in a moment.';
    return;
  }
  enableSound();
  client.emit('table-join', {create, publicTable, name:$('friendsName').value, code:$('friendsCode').value});
}
const sound = $('tableSound'), motion = $('tableMotion');
try {
  const saved = JSON.parse(localStorage.getItem('holdem-effects'));
  if (typeof saved?.sound === 'boolean') sound.checked = saved.sound;
  if (typeof saved?.motion === 'boolean') motion.checked = saved.motion;
} catch {}
function saveEffects() {
  try {
    localStorage.setItem('holdem-effects', JSON.stringify({sound:sound.checked, motion:motion.checked}));
  } catch {}
}
function enableSound() {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!sound.checked || !Audio) return;
  soundContext ||= new Audio();
  if (soundContext.state === 'suspended') soundContext.resume().catch(() => {});
}
function playSound(deal) {
  if (!sound.checked || soundContext?.state !== 'running') return;
  const tone = soundContext.createOscillator(), gain = soundContext.createGain();
  const now = soundContext.currentTime;
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(deal ? 420 : 250, now);
  tone.frequency.exponentialRampToValueAtTime(deal ? 180 : 135, now + .09);
  gain.gain.setValueAtTime(.055, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .1);
  tone.connect(gain).connect(soundContext.destination);
  tone.start(now);
  tone.stop(now + .11);
}
function moveChip(from, to) {
  if (!from?.getBoundingClientRect || !to?.getBoundingClientRect || !document.body) return;
  const chip = el('span', undefined, 'moving-chip');
  if (!chip.animate) return;
  const start = from.getBoundingClientRect(), end = to.getBoundingClientRect();
  chip.setAttribute('aria-hidden', 'true');
  chip.style.left = start.left + start.width / 2 + 'px';
  chip.style.top = start.top + start.height / 2 + 'px';
  document.body.append(chip);
  const animation = chip.animate([
    {transform:'translate(-50%, -50%)'},
    {transform:'translate(' + (end.left + end.width/2 - start.left - start.width/2) + 'px,' +
      (end.top + end.height/2 - start.top - start.height/2) + 'px)', opacity:.35}
  ], {duration:340, easing:'ease-out'});
  animation.onfinish = () => chip.remove();
}
function showRecap(awards) {
  $('recapTitle').textContent = 'Hand ' + game.handNumber + ' recap';
  $('recapBoard').textContent = game.board.length ? 'Board · ' + game.board.map(c =>
    ({11:'J',12:'Q',13:'K',14:'A'}[c.rank] || c.rank) + c.suit).join('  ') : 'No community cards dealt';
  const payouts = [...awards].map(([seat, amount]) => game.players[seat].name + ' collected ' + amount.toLocaleString() + ' chips.');
  $('recapLog').replaceChildren(...[...game.handLog, ...payouts].map(line => el('li', line)));
  $('recapWinners').replaceChildren(...[...awards].map(([seat, amount]) => {
    const player = game.players[seat];
    const details = el('details');
    details.append(el('summary', player.name + ' · ' + amount.toLocaleString() + ' chips'));
    if (game.board.length === 5 && player.hand.length === 2 && player.hand.every(Boolean)) {
      const rank = E.best([...player.hand, ...game.board]);
      const cards = el('div', undefined, 'cards');
      rank.cards.forEach(c => cards.append(card(c)));
      details.append(el('p', rank.name), cards);
    }
    game.results.forEach(({winners, amount: pot}, index) => {
      if (!winners.includes(seat)) return;
      const offset = i => (i - game.dealer - 1 + game.players.length) % game.players.length;
      const order = [...winners].sort((a,b) => offset(a) - offset(b));
      const share = Math.floor(pot / order.length) + Number(order.indexOf(seat) < pot % order.length);
      details.append(el('p', (index ? 'Side pot ' + index : 'Main pot') + ' · ' + share.toLocaleString() + ' chips'));
    });
    return details;
  }));
  $('handRecap').showModal();
}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function card(c,hidden=false){const n=el('span',undefined,'card'+(hidden?' back':!c?' empty':['♥','♦'].includes(c.suit)?' red':''));if(c&&!hidden){n.append(el('span',({11:'J',12:'Q',13:'K',14:'A'})[c.rank]||c.rank),el('span',c.suit));}n.setAttribute('aria-label',hidden?'Face-down card':c?(({'11':'Jack','12':'Queen','13':'King','14':'Ace'})[c.rank]||c.rank)+' '+c.suit:'Undealt community card');return n;}
function button(text,fn,cls){const b=el('button',text,cls);b.onclick=()=>{enableSound();fn();};$('actions').append(b);}
function act(type,target){if(online){socket.emit('table-act',{type,target,revision:online.revision});return;}if(!game.act(0,type,target)){$('error').textContent='That action is not available. Check the amount and try again.';return;}render();}
function render(){clearTimeout(timer);if(clock)clearInterval(clock);$('error').textContent='';$('seats').replaceChildren();const showdown=game.phase==='over'&&game.board.length===5&&game.players.filter(p=>!p.folded).length>1;
const identity = online?.code || game;
const newHand = game.handNumber > 0 && (previous?.game !== identity || previous.hand !== game.handNumber);
const motionEnabled = motion.checked !== false && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const newCards = newHand || (previous?.game === identity && game.board.length > previous.board);
const awards = new Map();
const winningCards = new Set();
const results = game.phase === 'over' ? game.results : [];
results.forEach(({ winners, amount }) => {
  // The engine awards odd chips clockwise, starting after the dealer.
  const order = [...winners].sort((a,b) => clockwise(a) - clockwise(b));
  order.forEach((seat, index) => {
    const share = Math.floor(amount / order.length) + Number(index < amount % order.length);
    awards.set(seat, (awards.get(seat) || 0) + share);
  });
});
// A split pot can contain several different five-card combinations.
const highlightedSeat = awards.has(seatOfUser()) ? seatOfUser() : awards.keys().next().value;
function clockwise(seat) {
  return (seat - game.dealer - 1 + game.players.length) % game.players.length;
}
game.players.forEach((player, i) => {
  const acting = game.turn === i;
  const won = awards.has(i);
  const rank = showdown && !player.folded ? E.best([...player.hand, ...game.board]) : null;
  const bestCards = new Set(i === highlightedSeat && rank ? rank.cards : []);
  bestCards.forEach(c => winningCards.add(c));
  const offset = (i - seatOfUser() + game.players.length) % game.players.length;
  const position = tablePositions[Math.round(offset * tablePositions.length / game.players.length)];
  const seat = el('article', undefined, 'seat s' + position +
    (acting ? ' active' : '') + (player.folded ? ' folded' : '') + (won ? ' winner' : ''));
  const heading = el('h3');
  heading.append(el('span', player.name.slice(0,1), 'seat-emblem'), el('span', player.name));
  const roles = [i === game.dealer && 'D', i === game.small && 'SB', i === game.big && 'BB'].filter(Boolean);
  roles.forEach(role => {
    const badge = el('span', role, 'seat-role');
    badge.setAttribute('aria-label', { D:'Dealer', SB:'Small blind', BB:'Big blind' }[role]);
    heading.append(badge);
  });
  const hand = el('div', undefined, 'cards');
  player.hand.forEach((c, index) => {
    const node = tableCard(c, i !== seatOfUser() && !rank, bestCards.has(c));
    if (newHand && motionEnabled && node.style) {
      node.className += ' dealt-card';
      node.style.animationDelay = ((index * game.players.length + i) * 17) + 'ms';
    }
    hand.append(node);
  });
  const nextSeat = online?.seatStatuses?.[i];
  const status = game.phase === 'over' && nextSeat?.status === 'Joined · plays next hand' ?
    nextSeat.name + ' · joins next hand' : won ? '+' + awards.get(i).toLocaleString() + (rank ? ' · ' + rank.name : '') :
    rank ? rank.name : player.folded ? (player.hand.length ? 'Folded' : 'Sitting out') :
    player.chips === 0 ? 'All-in' : acting ? 'Acting' : player.connected === false ? 'Disconnected' : ' ';
  seat.append(heading, hand,
    el('p', player.chips.toLocaleString() + ' chips' + (player.bet && !results.length ? ' · Bet ' + player.bet : '')),
    el('p', status + (player.lastAction ? ' · ' + player.lastAction : ''), 'seat-status'));
  $('seats').append(seat);
});
$('board').replaceChildren(...Array.from({length:5}, (_, i) =>
  {
    const node = tableCard(game.board[i], false, winningCards.has(game.board[i]));
    if (motionEnabled && game.board[i] && (newHand || i >= (previous?.board ?? 0))) node.className += ' dealt-card';
    return node;
  }));
const seats = $('seats').children;
const previousHand = previous?.game === identity && !newHand;
const changedBets = previousHand ? game.players.map((p,i) => p.total > previous.totals[i] ? i : -1).filter(i => i >= 0) : [];
const paid = results.length && (!previousHand || previous.phase !== 'over');
if (motionEnabled) {
  changedBets.forEach(i => moveChip(seats[i], $('pot')));
  if (paid) awards.forEach((amount, i) => moveChip($('pot'), seats[i]));
}
if (newCards || changedBets.length || paid) playSound(newCards);
previous = {game:identity, hand:game.handNumber, board:game.board.length, phase:game.phase, totals:game.players.map(p=>p.total)};
$('tableMode').textContent = (online ? (online.public ? 'Public table' : 'Room ' + online.code) + ' · ' : game.tournament ? 'Tournament · ' : 'Practice · ') +
  (game.bigBlind/2) + ' / ' + game.bigBlind;
if (!online && game.tournament) {
  const hand = Math.max(1, game.handNumber);
  const level = Math.min(10, Math.floor((hand - 1) / 5));
  const handsLeft = 5 - (hand - 1) % 5 - Number(game.phase === 'over');
  const remaining = game.players.filter(p => p.chips > 0 || (!p.folded && p.total > 0 && game.phase !== 'over')).length;
  $('tableMode').textContent += ' · ' + remaining + ' left · Level ' + (level + 1) +
    (level === 10 ? ' · Final blind level' : handsLeft === 0 ? ' · Blinds rise next hand' :
      ' · ' + handsLeft + (handsLeft === 1 ? ' hand' : ' hands') + ' to next level');
}
const pot = game.players.reduce((sum, player) => sum + player.total, 0);
$('pot').textContent = (results.length ? 'AWARDED ' : 'POT ') + pot.toLocaleString();
$('street').textContent = {ready:'Ready to deal', over:showdown ? 'Showdown' : 'Hand complete'}[game.phase] || game.phase;
$('handNo').textContent = 'HAND ' + game.handNumber;
const acting = game.players[game.turn];
const myTurn = !!acting && game.turn === seatOfUser() && (!online || socket.connected);
$('message').classList.toggle('your-turn', myTurn);
$('message').classList.remove('turn-warning');
if (!myTurn) alertedTurn = warnedTurn = undefined;
const turnKey = online ? online.code + ':' + game.handNumber + ':' + online.revision :
  game.handNumber + ':' + game.phase + ':' + game.log.length;
if (myTurn && alertedTurn !== turnKey) {
  alertedTurn = turnKey;
  playSound(false);
}
const call = acting && Math.min((online ? game.actingCall : game.legal(game.turn)?.call) || 0, acting.chips);
$('message').textContent = results.length ? results.map(({winners, amount}, index) =>
  (index ? 'Side pot ' + index : 'Main pot') + ' ' + amount.toLocaleString() + ' · ' +
  winners.map(i => game.players[i].name).join(' & ')).join(' | ') :
  acting ? (game.turn === seatOfUser() ? 'Your turn' : acting.name + ' to act') + (call ? ' · ' + call + ' to call' : ' · Check available') :
  game.message || 'Pull up a chair. Start your first hand.';
$('history').replaceChildren(...game.log.slice().reverse().map(s=>el('li',s)));
$('actions').replaceChildren();
if (online?.deadline && acting) {
  const message = $('message').textContent;
  const tick = () => {
    if (!socket.connected) {
      $('message').classList.remove('your-turn', 'turn-warning');
      return;
    }
    const seconds = Math.max(0, Math.ceil((online.deadline - Date.now()) / 1000));
    $('message').textContent = message + ' · ' + seconds + 's' +
      (myTurn && seconds <= 5 ? ' · Act now' : '');
    $('message').classList.toggle('turn-warning', myTurn && seconds <= 5);
    if (myTurn && seconds <= 5 && warnedTurn !== turnKey) {
      warnedTurn = turnKey;
      playSound(true);
    }
  };
  tick();
  clock = setInterval(tick, 250);
}
if (online && ['lobby','over'].includes(game.phase)) {
  if (game.phase === 'over' && !online.canDeal) {
    $('message').append(' · ' + (online.activeCount === 1 ? 'Waiting for one more active player' : 'Waiting for two active players'));
  }
  if (game.phase === 'lobby') $('message').textContent = (online.public ? 'Public table' : 'Share room code ' + online.code) +
    (online.canDeal ? ' · Ready to deal' : ' · Waiting for another player');
  if (online.startAt) {
    const resultMessage = game.phase === 'over' ? $('message').textContent + ' · Next hand in ' : 'Public table · Starting in ';
    const tick = () => {
      if (socket.connected) $('message').textContent = resultMessage +
        Math.max(0, Math.ceil((online.startAt - Date.now()) / 1000)) + 's';
    };
    tick();
    clock = setInterval(tick, 250);
  }
  if (online.rebuy) $('message').append(' · Rebuy ready for next hand');
  if (online.canRebuy) button('Rebuy 1,000 play chips', () => socket.emit('table-rebuy'), 'primary');
  if (online.canDeal && !online.public) button(game.phase === 'lobby' ? 'Deal cards' : 'Next hand',
    () => socket.emit('table-deal', online.revision), 'primary');
  if (game.phase === 'over') button('Hand recap', () => showRecap(awards), 'recap-button');
  return;
}
if(['ready','over'].includes(game.phase)){if(game.players.filter(p=>p.chips>0).length<2){button('New table',()=>reset(),'primary');$('message').textContent=game.players.find(p=>p.chips>0).name+' wins the table!';}else button(game.phase==='ready'?'Take a seat & deal':'Next hand',()=>{game.start();render();},'primary');if(game.phase==='over')button('Hand recap',()=>showRecap(awards),'recap-button');return;}
const legal = game.legal(seatOfUser());
if (legal) {
  button('Fold', () => act('fold'), 'danger');
  button(call ? 'Call ' + call : 'Check', () => act(call ? 'call' : 'check'), 'primary');
  if (legal.canRaise && legal.max > game.currentBet) {
    addBetControls(legal, pot);
  } else if (call && call === game.players[seatOfUser()].chips) {
    button('All-in ' + call, () => act('call'), 'all-in');
  }
} else if (acting && !online) {
  const current = game;
  timer = setTimeout(() => {
    if (current !== game) return;
    bot();
    render();
  }, 1400);
}}
function tableCard(value, hidden, winning) {
  const node = card(value, hidden);
  if (winning) node.className += ' winning-card';
  return node;
}
function addBetControls(legal, pot) {
  const minimum = Math.min(legal.min, legal.max);
  if (minimum < legal.max) {
    const label = el('label', undefined, 'bet-slider');
    const amount = el('span');
    const slider = el('input');
    slider.type = 'range';
    slider.min = minimum;
    slider.max = legal.max;
    slider.step = 1;
    slider.value = minimum;
    slider.setAttribute('aria-label', 'Total bet amount');
    const update = target => {
      slider.value = Math.max(minimum, Math.min(legal.max, target));
      amount.textContent = 'Raise to ' + Number(slider.value).toLocaleString();
    };
    update(minimum);
    slider.oninput = () => update(Number(slider.value));
    label.append(amount, slider);
    $('actions').append(label);
    const afterCall = pot + legal.call;
    button('½ Pot', () => update(game.currentBet + Math.floor(afterCall / 2)), 'bet-preset');
    button('Pot', () => update(game.currentBet + afterCall), 'bet-preset');
    button('Raise', () => act('raise', Number(slider.value)), 'raise');
  }
  button('All-in ' + legal.max, () => act('raise', legal.max), 'all-in');
}
function bot(){const i=game.turn,l=game.legal(i);if(!l)return;const p=game.players[i],r=p.hand.map(c=>c.rank),rank=game.board.length>=3?E.best([...p.hand,...game.board]).value[0]:r[0]===r[1]?2:Math.max(...r)>=12?1:0;const strength=rank+Math.random();if(l.call&&l.call>p.chips*.35&&strength<1.15){game.act(i,'fold');return;}if(l.canRaise&&l.max>=l.min&&strength>1.7&&Math.random()<.28){game.act(i,'raise',Math.min(l.max,Math.max(l.min,game.currentBet+40)));return;}game.act(i,l.call?'call':'check');}
function reset(tournament=game.tournament){if(online)return false;if(game.handNumber&&!confirm('Start a new table with 1,000 chips each?'))return;clearTimeout(timer);game=new E.Game(Math.random,8,tournament);render();return true;}$('reset').onclick=()=>reset();$('rulesBtn').onclick=()=>$('rules').showModal();$('closeRules').onclick=()=>$('rules').close();
$('tableOptions').onclick=()=>$('tableSettings').showModal();
$('closeOptions').onclick=()=>$('tableSettings').close();
$('closeRecap').onclick=()=>$('handRecap').close();
$('practiceMode').onclick=()=>{if(reset(false))$('tableSettings').close();};
$('tournamentMode').onclick=()=>{if(reset(true))$('tableSettings').close();};
$('friendsButton').onclick=()=>{$('friendsLobby').showModal();connectFriends();};
$('friendsClose').onclick=()=>$('friendsLobby').close();
$('friendsCreate').onclick=()=>requestRoom(true);
$('friendsJoin').onclick=()=>requestRoom(false);
$('publicJoin').onclick=()=>requestRoom(false, true);
$('friendsSit').onclick=()=>socket.emit('table-sit-out', !online.sittingOut);
$('friendsInvite').onclick=async()=>{
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', online.code);
  try {
    await navigator.clipboard.writeText(url.href);
    $('friendsStatus').textContent = 'Invite link copied.';
  } catch {
    $('friendsStatus').textContent = 'Invite link · ' + url.href;
  }
};
$('friendsFind').onclick=()=>socket.emit('table-find');
$('friendsLeave').onclick=()=>leaveFriends();
sound.onchange=()=>{saveEffects();enableSound();};
motion.onchange=saveEffects;
if (globalThis.io && sessionStorage.getItem('holdem-private-seat')) connectFriends();
render();
const invitedRoom = new URLSearchParams(location.search).get('room');
if (/^[0-9a-f]{6}$/i.test(invitedRoom || '') && !sessionStorage.getItem('holdem-private-seat')) {
  $('friendsCode').value = invitedRoom.toUpperCase();
  $('friendsButton').click();
}
})();
