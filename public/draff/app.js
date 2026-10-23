const $=id=>document.getElementById(id),E=Checkers;let b,s,selected,chain,history,last,over,busy,timer,quiet,repeats,turnCapture,pending=[],claiming=false,turnSaved=false,notice='',captureSquares=[],captureUntil=0;const mode=$('mode'),level=$('level');
function snapshot(){return {b:b.slice(),s,last:last.slice(),quiet,repeats:{...repeats},pending:pending.slice()}}
function reset(){clearTimeout(timer);b=E.initial();s=1;selected=-1;chain=-1;history=[];last=[];over='';busy=false;quiet=0;repeats={};turnCapture=false;pending=[];claiming=false;turnSaved=false;notice='';captureSquares=[];captureUntil=0;record();render();}
function record(){let k=b.join(',')+':'+s+':'+pending.join(',');repeats[k]=(repeats[k]||0)+1;if(repeats[k]>=3)over='Draw · repeated position';if(quiet>=80)over='Draw · 80 quiet turns';}
function legal(){return E.moves(b,s,chain)}
function showCapture(squares){captureSquares=squares;captureUntil=Date.now()+1100;}
function render(){let options=legal();$('board').replaceChildren();for(let i=0;i<64;i++){let cell=document.createElement('button'),p=b[i];cell.className='square'+(((i>>3)+i%8)%2?' dark':'')+(i===selected?' selected':'')+(last.includes(i)?' last':'')+(Date.now()<captureUntil&&captureSquares.includes(i)?' captured':'');let name=String.fromCharCode(97+i%8)+(8-(i>>3));cell.setAttribute('aria-label',name+(p?' '+(p>0?'Gold':'Black')+(Math.abs(p)===2?' king':' piece'):' empty'));if(p){let piece=document.createElement('span');piece.className='piece'+(p<0?' black':'');if(Math.abs(p)===2){let crown=document.createElement('span');crown.className='crown';crown.textContent='♛';piece.append(crown)}cell.append(piece)}cell.onclick=()=>click(i);$('board').append(cell);}
$('blackCount').textContent=b.filter(p=>p<0).length+' pieces';$('redCount').textContent=b.filter(p=>p>0).length+' pieces';$('opponent').textContent=mode.value==='ai'?'Computer · Black':'Player 2 · Black';$('you').textContent=(typeof DraffProfile!=='undefined'&&DraffProfile.ready()?DraffProfile.name():mode.value==='ai'?'You':'Player 1')+' · Gold';$('status').textContent=over|| (busy?'Computer is thinking…':s===1?(mode.value==='ai'?'Your turn':'Gold’s turn'):'Black’s turn');$('claim').disabled=busy||!!over||chain>=0; $('claim').textContent=claiming?'Cancel Huff':'Huff';$('hint').textContent=over?'Start a new game for another round.':notice|| (claiming?'Tap the opposing piece that missed a capture.':chain>=0?'Keep jumping with the selected piece.':'Select a piece, then choose where to move.');$('level').disabled=mode.value==='local';if(typeof netRender==='function')netRender();}
function click(i){if(typeof DraffProfile!=='undefined'&&!DraffProfile.ready())return;if(over||busy||(mode.value==='ai'&&s<0))return;if(claiming){let n=E.claim(b,s,pending,i);if(n){if(!turnSaved){history.push(snapshot());turnSaved=true}b=n;pending=[];quiet=0;claiming=false;notice='Huff! Piece removed. Now make your move.';checkEnd();}else notice='That piece cannot be huffed.';render();return;}notice='';let opts=legal(),m=opts.find(m=>m.from===selected&&m.to===i);if(m){if(chain<0){if(!turnSaved){history.push(snapshot());turnSaved=true}pending=E.missed(b,s,m);claiming=false;turnCapture=false}let old=b[m.from],n=E.apply(b,m);b=n.board;last=[m.from,m.to];showCapture(m.take===undefined?[]:[m.take]);turnCapture=turnCapture||m.take!==undefined||old!==b[m.to];if(n.again){chain=m.to;selected=m.to;render()}else finish();return}if(chain<0){selected=opts.some(m=>m.from===i)?i:-1;render()}}
function checkEnd(){if(!E.moves(b,s).length&&!pending.some(i=>{let n=E.claim(b,s,pending,i);return n&&E.moves(n,s).length}))over=(s===1?'Black':'Gold')+' wins!';}
function finish(){quiet=turnCapture?0:quiet+1;s=-s;chain=-1;selected=-1;turnSaved=false;claiming=false;checkEnd();if(!over)record();render();if(!over&&mode.value==='ai'&&s<0){busy=true;render();timer=setTimeout(ai,1800)}}
function ai(){
 let huffed=false;
 if(pending.length){let chance=level.value==='2'?0.45:level.value==='4'?0.8:1;if(Math.random()<chance){let i=pending.find(i=>E.claim(b,s,pending,i));if(i!==undefined){b=E.claim(b,s,pending,i);notice='Computer called Huff and removed one piece.';quiet=0;huffed=true;}}}
 pending=[];
 let ts=E.turns(b,-1),best=Infinity,choices=[];
 if(ts.some(t=>t.path[0].take!==undefined))ts=ts.filter(t=>t.path[0].take!==undefined);
 for(let t of ts){let score=E.search(t.board,1,Number(level.value)-1);if(score<best){best=score;choices=[t]}else if(score===best)choices.push(t)}
 if(!choices.length){busy=false;over='Gold wins!';render();return}
 let t=choices[Math.floor(Math.random()*choices.length)];
 turnCapture=t.path.some(m=>m.take!==undefined)||t.board.some((p,i)=>Math.abs(p)===2&&Math.abs(b[i])!==2);
 pending=E.missed(b,s,t.path[0]);
 function step(index){
  let m=t.path[index];b=E.apply(b,m).board;last=[m.from,m.to];showCapture(m.take===undefined?[]:[m.take]);render();
  if(index+1<t.path.length)timer=setTimeout(()=>step(index+1),1400);
  else{busy=false;finish();}
 }
 if(huffed){render();timer=setTimeout(()=>step(0),1400)}else step(0);
}

$('claim').onclick=()=>{claiming=!claiming;selected=-1;notice='';render()};
$('new').onclick=()=>{if(history.length||busy)$('confirm').showModal();else reset()};$('yes').onclick=()=>{$('confirm').close();reset()};$('no').onclick=()=>$('confirm').close();mode.onchange=reset;reset();
