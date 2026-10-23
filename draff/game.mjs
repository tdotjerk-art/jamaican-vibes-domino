import * as E from './engine.mjs';
export function fresh(){return {b:E.initial(),s:1,chain:-1,last:[],captureSquares:[],quiet:0,repeats:{},pending:[],over:'',notice:'',active:false,rematch:[]};}
function finish(g,capture){g.quiet=capture?0:g.quiet+1;g.s=-g.s;g.chain=-1;checkEnd(g);let key=g.b.join(',')+':'+g.s+':'+g.pending.join(',');g.repeats[key]=(g.repeats[key]||0)+1;if(!g.over&&(g.repeats[key]>=3||g.quiet>=80))g.over='Draw';}
function checkEnd(g){if(!E.moves(g.b,g.s).length&&!g.pending.some(i=>{let n=E.claim(g.b,g.s,g.pending,i);return n&&E.moves(n,g.s).length}))g.over=(g.s===1?'Black':'Gold')+' wins!';}
export function act(state,player,a){let g=structuredClone(state);g.captureSquares=[];if(!g.active)throw Error('Wait for another player to join.');
 if(a.type==='rematch'){if(!g.rematch.includes(player))g.rematch.push(player);if(g.rematch.length===2){g=fresh();g.active=true;g.notice='New game started. Gold moves first.';}return g;}
 if(g.over)throw Error('This game is finished. Request a new game.');if(player!==g.s)throw Error('Wait for your turn.');
 if(a.type==='huff'){if(g.chain>=0)throw Error('Finish your capture first.');let n=E.claim(g.b,player,g.pending,a.at);if(!n)throw Error('That piece cannot be huffed.');g.b=n;g.captureSquares=[];g.pending=[];g.quiet=0;g.notice=(player===1?'Gold':'Black')+' called Huff.';g.rematch=[];checkEnd(g);return g;}
 if(a.type!=='move'||!Number.isInteger(a.from)||!Number.isInteger(a.to))throw Error('Invalid move.');
 let m=E.moves(g.b,player,g.chain).find(m=>m.from===a.from&&m.to===a.to);if(!m)throw Error('That move is not allowed.');
 if(g.chain<0)g.pending=E.missed(g.b,player,m);
 let old=g.b[m.from],n=E.apply(g.b,m);g.b=n.board;g.last=[m.from,m.to];g.captureSquares=m.take===undefined?[]:[m.take];g.notice='';g.rematch=[];
 if(n.again){g.chain=m.to;g.quiet=0;}else finish(g,m.take!==undefined||old!==g.b[m.to]);return g;
}
export function view(g){let {pending,repeats,...safe}=g;return safe;}
