/* Visual preparation only: the existing engines still shuffle and own the deal. */
(function(){
 'use strict';
 const D=document,DURATION=4000;
 let generation=0,overlay=null,onlineHand=null,pendingState=null;
 const style=D.createElement('style');
 style.textContent=`
 .jv-dealing #playerTimers,.jv-dealing .hand,.jv-dealing #board,.jv-dealing [id^="turnTimer"],.jv-dealing #jvLiveEvent,.jv-dealing #jvBigMoment,.jv-dealing .online-pose-choice{visibility:hidden!important}
 #jvDealStage{position:fixed;inset:0;z-index:19000;pointer-events:auto;overflow:hidden}
 #jvDealStage .deal-label{position:absolute;left:50%;top:43%;transform:translate(-50%,-50%);padding:10px 20px;border-radius:24px;background:#062d20ed;color:#ffe276;font:bold clamp(16px,3vw,26px) Arial;text-align:center;white-space:nowrap;box-shadow:0 3px 15px #0008}
 .jv-shuffle-tile{position:absolute;left:0;top:0;width:var(--dw);height:var(--dh);border:2px solid #d8bb61;border-radius:5px;box-sizing:border-box;background:linear-gradient(140deg,#111 0 33%,#07844c 34% 67%,#dcba28 68%);box-shadow:2px 3px 5px #0008;will-change:transform,opacity}
 `;D.head.appendChild(style);
 function clear(){generation++;overlay?.remove();overlay=null;D.body.classList.remove('jv-dealing')}
 function animate(duration=DURATION){
  clear();const key=generation;
  const table=D.querySelector('.table'),r=table?.getBoundingClientRect();
  if(!r||!r.width)return Promise.resolve(true);
  D.body.classList.add('jv-dealing');
  overlay=D.createElement('div');overlay.id='jvDealStage';overlay.setAttribute('role','status');overlay.setAttribute('aria-label','Shuffling dominoes, then dealing seven to each player');
  const label=D.createElement('div');label.className='deal-label';label.textContent='Shuffling dominoes…';overlay.appendChild(label);D.body.appendChild(overlay);
  const w=Math.max(14,Math.min(34,r.width*.037)),h=w*1.85,cx=r.left+r.width/2,cy=r.top+r.height/2;
  const targets=[[cx,r.bottom-h*.25],[r.right-w*.3,cy],[cx,r.top+h*.25],[r.left+w*.3,cy]];
  for(let i=0;i<28;i++){
   const el=D.createElement('div');el.className='jv-shuffle-tile';el.style.setProperty('--dw',w+'px');el.style.setProperty('--dh',h+'px');overlay.appendChild(el);
   const frames=[];
   for(let k=0;k<7;k++){
    const a=(i*2.4+k*1.7),radius=(.16+((i*13+k*7)%17)/65)*Math.min(r.width,r.height);
    frames.push({transform:`translate(${cx+Math.cos(a)*radius-w/2}px,${cy+Math.sin(a)*radius*.63-h/2}px) rotate(${i*37+k*115}deg)`,offset:k*.075,opacity:1});
   }
   const seat=i%4,n=Math.floor(i/4),start=.53+i*.011,target=targets[seat];
   const x=target[0]+(seat%2?0:(n-3)*w*.82)-w/2,y=target[1]+(seat%2?(n-3)*w*.82:0)-h/2;
   frames.push({...frames[frames.length-1],offset:start});
   frames.push({transform:`translate(${x}px,${y}px) rotate(${seat%2?90:0}deg)`,offset:Math.min(.96,start+.12),opacity:1});
   frames.push({transform:`translate(${x}px,${y}px) rotate(${seat%2?90:0}deg)`,offset:1,opacity:1});
   el.animate(frames,{duration,fill:'forwards',easing:'ease-in-out'});
  }
  setTimeout(()=>{if(key===generation)label.textContent='Dealing — seven each…'},duration*.52);
  return new Promise(resolve=>setTimeout(()=>{if(key===generation){overlay?.remove();overlay=null;D.body.classList.remove('jv-dealing');resolve(true)}else resolve(false)},duration));
 }
 const deal=window.dealHand;
 window.dealHand=function(){
  if(window.gameConnectionMode==='online')return deal.apply(this,arguments);
  const self=this,args=arguments;
  if(typeof closeModal==='function')closeModal();
  if(typeof stopTurnTimer==='function')stopTurnTimer();
  if(typeof stopPoseTimer==='function')stopPoseTimer();
  animate().then(ok=>{if(ok)deal.apply(self,args)});
 };
 const apply=window.applyAuthoritativeOnlineState;
 window.applyAuthoritativeOnlineState=function(state){
  const hand=state?.handNo,remaining=(state?.dealUntil||0)-Date.now();
  if(remaining>0&&hand!==onlineHand){
   onlineHand=hand;pendingState=state;
   // Let the existing UI enter the table, then hide hands until the visual deal ends.
   apply.call(this,state);
   animate(Math.min(DURATION,remaining)).then(ok=>{if(ok&&pendingState){const next=pendingState;pendingState=null;apply.call(window,next)}});
   return;
  }
  if(overlay&&window.gameConnectionMode==='online'){pendingState=state;return}
  if(hand)onlineHand=hand;return apply.call(this,state);
 };
 D.addEventListener('click',e=>{if(e.target.closest('#jvQuitGameBtn,#jvLeave,#jvLeaveTop')){clear();pendingState=null;onlineHand=null}},true);
})();
