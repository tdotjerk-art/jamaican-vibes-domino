(()=>{'use strict';const $=id=>document.getElementById(id),E=JVHoldem;let game=new E.Game(),timer;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function card(c,hidden=false){const n=el('span',undefined,'card'+(hidden?' back':!c?' empty':['♥','♦'].includes(c.suit)?' red':''));if(c&&!hidden){n.append(el('span',({11:'J',12:'Q',13:'K',14:'A'})[c.rank]||c.rank),el('span',c.suit));}n.setAttribute('aria-label',hidden?'Face-down card':c?(({'11':'Jack','12':'Queen','13':'King','14':'Ace'})[c.rank]||c.rank)+' '+c.suit:'Undealt community card');return n;}
function button(text,fn,cls){const b=el('button',text,cls);b.onclick=fn;$('actions').append(b);}
function act(type,target){if(!game.act(0,type,target)){$('error').textContent='That action is not available. Check the amount and try again.';return;}render();}
function render(){clearTimeout(timer);$('error').textContent='';$('seats').replaceChildren();const showdown=game.phase==='over'&&game.board.length===5&&game.players.filter(p=>!p.folded).length>1;
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
function clockwise(seat) {
  return (seat - game.dealer - 1 + game.players.length) % game.players.length;
}
game.players.forEach((player, i) => {
  const acting = game.turn === i;
  const won = awards.has(i);
  const rank = showdown && !player.folded ? E.best([...player.hand, ...game.board]) : null;
  const bestCards = new Set(won && rank ? rank.cards : []);
  bestCards.forEach(c => winningCards.add(c));
  const seat = el('article', undefined, 'seat s' + i +
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
  player.hand.forEach(c => hand.append(tableCard(c, i !== 0 && !rank, bestCards.has(c))));
  const status = won ? '+' + awards.get(i).toLocaleString() + (rank ? ' · ' + rank.name : '') :
    rank ? rank.name : player.folded ? (player.hand.length ? 'Folded' : 'Sitting out') :
    player.chips === 0 ? 'All-in' : acting ? 'Acting' : ' ';
  seat.append(heading, hand,
    el('p', player.chips.toLocaleString() + ' chips' + (player.bet && !results.length ? ' · Bet ' + player.bet : '')),
    el('p', status, 'seat-status'));
  $('seats').append(seat);
});
$('board').replaceChildren(...Array.from({length:5}, (_, i) =>
  tableCard(game.board[i], false, winningCards.has(game.board[i]))));
const pot = game.players.reduce((sum, player) => sum + player.total, 0);
$('pot').textContent = (results.length ? 'AWARDED ' : 'POT ') + pot.toLocaleString();
$('street').textContent = {ready:'Ready to deal', over:showdown ? 'Showdown' : 'Hand complete'}[game.phase] || game.phase;
$('handNo').textContent = 'HAND ' + game.handNumber;
const acting = game.players[game.turn];
const call = acting && Math.min(game.legal(game.turn)?.call || 0, acting.chips);
$('message').textContent = results.length ? results.map(({winners, amount}, index) =>
  (index ? 'Side pot ' + index : 'Main pot') + ' ' + amount.toLocaleString() + ' · ' +
  winners.map(i => game.players[i].name).join(' & ')).join(' | ') :
  acting ? (game.turn === 0 ? 'Your turn' : acting.name + ' to act') + (call ? ' · ' + call + ' to call' : ' · Check available') :
  game.message || 'Pull up a chair. Start your first hand.';
$('history').replaceChildren(...game.log.slice().reverse().map(s=>el('li',s)));
$('actions').replaceChildren();
if(['ready','over'].includes(game.phase)){if(game.players.filter(p=>p.chips>0).length<2){button('New table',reset,'primary');$('message').textContent=game.players.find(p=>p.chips>0).name+' wins the table!';}else button(game.phase==='ready'?'Take a seat & deal':'Next hand',()=>{game.start();render();},'primary');return;}
const legal = game.legal(0);
if (legal) {
  button('Fold', () => act('fold'), 'danger');
  button(call ? 'Call ' + call : 'Check', () => act(call ? 'call' : 'check'), 'primary');
  if (legal.canRaise && legal.max > game.currentBet) {
    addBetControls(legal, pot);
  } else if (call && call === game.players[0].chips) {
    button('All-in ' + call, () => act('call'), 'all-in');
  }
} else if (acting) {
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
function reset(){if(game.handNumber&&!confirm('Start a new table with 1,000 chips each?'))return;clearTimeout(timer);game=new E.Game();render();}$('reset').onclick=reset;$('rulesBtn').onclick=()=>$('rules').showModal();$('closeRules').onclick=()=>$('rules').close();render();})();
