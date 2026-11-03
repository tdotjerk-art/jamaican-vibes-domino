/* Shared sound preferences for online play, computer play and Extras. */
(function(){
 'use strict';
 const labels={play:'Domino placement',double:'Double domino',pass:'Passing',ready:'Player ready',last:'Last domino warning',hand:'Hand win',blocked:'Blocked game',bruck:'Bruck / score reset',six:'Double-six opening',match:'Match win',achievement:'Achievement',crowd:'Crowd reactions',ambience:'Background ambience'};
 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(e){return fallback}}
 const old=read('jvCompleteSettings',{}),saved=read('jvSoundSettings',{});
 const values=Object.fromEntries(Object.keys(labels).map(k=>[k,saved[k]===undefined?(k==='ambience'?!!old.ambience:k==='crowd'?old.crowd!==false:true):!!saved[k]]));
 const master=()=>{const el=document.getElementById('jvSound');try{return el?el.checked:localStorage.getItem('jvSound')!=='off'}catch(e){return true}};
 function sync(){
  document.querySelectorAll('[data-sound-kind]').forEach(el=>el.checked=values[el.dataset.soundKind]);
  for(const [id,key] of [['jvAmbience','ambience'],['jvCrowd','crowd']]){const el=document.getElementById(id);if(el)el.checked=values[key]}
 }
 function set(kind,on){if(!(kind in labels))return;values[kind]=!!on;try{localStorage.setItem('jvSoundSettings',JSON.stringify(values))}catch(e){}sync();window.dispatchEvent(new Event('jv-sound-change'))}
 window.JVSound={enabled:kind=>master()&&values[kind]!==false,get:kind=>values[kind],set};
 document.addEventListener('DOMContentLoaded',()=>{
  const container=document.getElementById('jvSoundOptions');
  for(const [kind,label] of Object.entries(labels)){
   const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:12px;min-height:44px;padding:4px 0';
   const input=document.createElement('input');input.type='checkbox';input.dataset.soundKind=kind;input.onchange=()=>set(kind,input.checked);row.append(input,document.createTextNode(label));container.appendChild(row);
  }
  for(const [id,key] of [['jvAmbience','ambience'],['jvCrowd','crowd']]){const el=document.getElementById(id);if(el)el.addEventListener('change',()=>set(key,el.checked))}
  document.getElementById('jvSound').addEventListener('change',()=>window.dispatchEvent(new Event('jv-sound-change')));
  document.getElementById('jvMuteBtn').addEventListener('click',()=>window.dispatchEvent(new Event('jv-sound-change')));
  sync();
 });
})();

/* A single unpitched tile impact, shared by local and online play. */
(function(){
 let context,lastImpact=0;
 window.jvDominoKnock=function(kind='play',heavy=false){
  if(!window.JVSound.enabled(kind))return;
  try{
   const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
   context=context||new AC();
   if(context.state==='suspended')context.resume().catch(()=>{});
   const now=context.currentTime;
   // Multiple game listeners may report the same placement.
   if(now-lastImpact<.085&&lastImpact)return;lastImpact=now;
   const duration=heavy?.18:.12;
   const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
   const data=buffer.getChannelData(0);
   let body=0;
   for(let i=0;i<data.length;i++){
    const t=i/context.sampleRate,n=Math.random()*2-1;
    body=.83*body+.17*n;
    data[i]=(n*.38*Math.exp(-t/ .009)+body*2.4*Math.exp(-t/(heavy?.036:.024)))*Math.min(1,t/.0005);
   }
   const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
   source.buffer=buffer;filter.type='lowpass';filter.frequency.value=heavy?2400:3200;
   gain.gain.value=heavy?.85:.65;
   source.connect(filter);filter.connect(gain);gain.connect(context.destination);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};source.start(now);
  }catch(e){}
 };
})();
