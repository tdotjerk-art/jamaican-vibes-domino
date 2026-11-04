/* Reference-inspired tile weight and wooden-table impact. No game-state writes. */
(function(){
 'use strict';
 let context=null,handKey=null,lastOrder=0,initialized=false;
 const pending=new Set();
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const enabled=kind=>window.JVSound?.enabled(kind)!==false;
 function audio(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!context)context=new AC();
  if(context.state==='suspended')context.resume().catch(()=>{});
  return context;
 }
 document.addEventListener('pointerdown',()=>{try{audio()}catch(e){}},{once:true,passive:true});
 function knock(strong,isDouble){
  if(!enabled('play'))return;
  if(isDouble&&!enabled('double'))strong=false;
  try{
   const c=audio();if(!c || c.state!=='running')return;
   const t=c.currentTime,level=strong?.32:.21;
   // Broadband tile click over a short, low wooden resonance; slight variation
   // avoids an identical electronic beep on every play.
   const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*.085),c.sampleRate);
   const data=buffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*.012));
   const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
   source.buffer=buffer;filter.type='lowpass';filter.frequency.value=2400+Math.random()*800;
   gain.gain.value=level;source.connect(filter);filter.connect(gain);gain.connect(c.destination);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};source.start(t);
   for(const [frequency,duration,volume] of [[strong?100:145,.14,level],[310,.045,level*.25]]){
    const o=c.createOscillator(),g=c.createGain();o.type='sine';
    o.frequency.setValueAtTime(frequency*(.95+Math.random()*.1),t);
    o.frequency.exponentialRampToValueAtTime(frequency*.65,t+duration);
    g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(c.destination);o.onended=()=>{o.disconnect();g.disconnect()};o.start(t);o.stop(t+duration);
   }
  }catch(e){}
 }
 function later(fn,delay){const id=setTimeout(()=>{pending.delete(id);fn()},delay);pending.add(id)}
 function clear(){for(const id of pending)clearTimeout(id);pending.clear()}
 function land(tile,winning){
  const el=document.querySelector('#board .dom-physical[data-played-order="'+Number(tile.playedOrder)+'"]');
  if(!el)return;
  const strong=winning||tile.a===tile.b,quietMotion=reduced();
  // Individual translate/scale leave the renderer's rotation and final geometry intact.
  if(!quietMotion && el.animate)el.animate([
   {translate:'0 -32px',scale:'1.18',filter:'drop-shadow(0 14px 6px #0008)',offset:0},
   {translate:'0 -40px',scale:'1.22',offset:.22},
   {translate:'0 0',scale:strong?'1.07 .94':'1.03 .97',offset:.5},
   {translate:'0 -5px',scale:'1.01',offset:.68},
   {translate:'0 0',scale:'1',filter:'none',offset:1}
  ],{duration:320,easing:'linear'});
  later(()=>{
   if(!el.isConnected || document.hidden)return;
   knock(strong,tile.a===tile.b);
   if(!quietMotion && strong){
    const table=document.querySelector('.table');
    table?.animate?.([{translate:'0 0'},{translate:'0 2px'},{translate:'0 -1px'},{translate:'0 0'}],{duration:140});
   }
  },quietMotion?0:160);
 }
 function observe(tiles,hand,options={}){
  const key=(options.online?'online:'+String(options.room||'')+':':'local:')+hand;
  const order=tiles.reduce((max,t)=>Math.max(max,Number(t.playedOrder)||0),0);
  if(key!==handKey || !tiles.length){clear();handKey=key;lastOrder=0}
  // Loading/reconnecting to an existing chain must not replay its historical slam.
  if(!initialized || key!==observe.previousKey){
   initialized=true;observe.previousKey=key;
   if(tiles.length>1){lastOrder=order;return}
  }
  if(order<=lastOrder)return;
  const newest=tiles.find(t=>Number(t.playedOrder)===order);lastOrder=order;
  if(newest)land(newest,!!options.winning);
 }
 window.addEventListener('pagehide',clear);
 window.JVDominoEnergy={observe};
})();
